import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { createServer } from 'node:http';
import { HttpApi, type Transport } from '../src/core/api';
import { ImportController, type Files, type Store } from '../src/core/controller';
import { acceptJob, Fault, MAX_BYTES, parseJournal, parseJob, type Journal, type LocalFile } from '../src/core/model';
import { inspectFile, type ByteReader } from '../src/core/validation';

const { createMockServer } = await import(new URL('../../kit/mock-server.mjs', import.meta.url).href);
const fixture = (name: string) => readFile(new URL(`../../kit/fixtures/${name}`, import.meta.url));
const csv = await fixture('statement.csv');
const validFile: LocalFile = { stagedId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.bin', name: 'statement.csv', size: csv.length, format: 'csv' };
const transport: Transport = (url, options) => fetch(url, options as RequestInit);

class MemoryStore implements Store {
  raw: string | null = null;
  fail = false;
  async load() { return this.raw === null ? null : parseJournal(this.raw); }
  async save(op: Journal | null) { if (this.fail) throw new Error('storage failed'); this.raw = op === null ? null : JSON.stringify(op); }
}
class TestFiles implements Files {
  bytes = new Map<string, Uint8Array>([[validFile.stagedId, csv]]);
  failRemove = false;
  async remove(file: LocalFile) { if (this.failRemove) throw new Error(); this.bytes.delete(file.stagedId); }
  async sweep(_keep?: string) {}
  async verify(file: LocalFile) {
    const bytes = this.bytes.get(file.stagedId);
    if (!bytes) throw new Fault('file-missing');
    const result = await inspectFile(reader(bytes));
    if (result.size !== file.size || result.format !== file.format) throw new Fault('file-changed');
  }
}
function reader(bytes: Uint8Array, metrics = { maxRead: 0, read: 0, closed: false }): ByteReader {
  let offset = 0;
  return { async read(length) { metrics.maxRead = Math.max(metrics.maxRead, length); const result = bytes.subarray(offset, offset + length); offset += result.length; metrics.read += result.length; return result; }, close() { metrics.closed = true; } };
}
async function withServer(run: (base: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'statement-client-test-'));
  const server = createMockServer({ statePath: join(directory, 'state.json') });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise<void>(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}
async function scenario(base: string, mode: string) {
  assert.equal((await fetch(`${base}/__test/scenario`, { method: 'POST', body: JSON.stringify({ mode }) })).status, 200);
}
async function stats(base: string) { return (await (await fetch(`${base}/__test/state`)).json()).stats; }
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function setup(base: string, store = new MemoryStore(), files = new TestFiles(), customTransport = transport) {
  let keyCount = 0;
  const api = new HttpApi(customTransport, async file => files.bytes.get(file.stagedId));
  const controller = new ImportController(store, files, api, () => `random-stable-key-${++keyCount}`, { async load() { return []; }, async save() {} });
  return { controller, store, files, api };
}

test('journal is saved before real bytes POST; 202 remains queued; ready comes from HTTP', async () => {
  await withServer(async base => {
    const store = new MemoryStore();
    const { controller, files } = setup(base, store, new TestFiles(), async (url, options) => {
      if (options.method === 'POST') {
        const persisted = await store.load();
        assert.equal(persisted?.phase, 'uncertain');
        assert.equal(persisted?.key, options.headers['Idempotency-Key']);
        assert.deepEqual(options.body, csv);
      }
      return transport(url, options);
    });
    await controller.boot(); await controller.select(validFile, base); await controller.submit();
    assert.equal(controller.snapshot().operation?.job?.status, 'queued');
    assert.equal(files.bytes.size, 0);
    await pause(1050); await controller.refresh();
    const job = controller.snapshot().operation?.job;
    assert.equal(job?.status, 'ready');
    assert.equal(job?.items?.reduce((sum, item) => sum + item.amountMinor, 0), 15199);
    assert.deepEqual((await stats(base)), { createRequests: 1, newJobs: 1, duplicateHits: 0, acceptedBytes: csv.length, deleteRequests: 0 });
  });
});

test('lost_ack + relaunch restores by saved key without a second POST', async () => {
  await withServer(async base => {
    await scenario(base, 'lost_ack');
    const { controller, store, files } = setup(base);
    await controller.boot(); await controller.select(validFile, base); await controller.submit();
    assert.equal(controller.snapshot().fault, 'network');
    const key = (await store.load())?.key;
    assert.equal((await store.load())?.phase, 'uncertain');
    controller.dispose();
    const restored = setup(base, store, files).controller;
    await restored.boot();
    assert.equal(restored.snapshot().operation?.key, key);
    assert.ok(restored.snapshot().operation?.job);
    assert.equal((await stats(base)).newJobs, 1);
    assert.equal((await stats(base)).createRequests, 1);
  });
});

test('lookup 404 while POST outcome is uncertain does not rotate key; explicit retry uses identical bytes', async () => {
  await withServer(async base => {
    const store = new MemoryStore();
    const files = new TestFiles();
    let dropBeforeSend = true;
    const keys: string[] = [];
    const { controller } = setup(base, store, files, async (url, options) => {
      if (options.method === 'POST') {
        keys.push(options.headers['Idempotency-Key']!);
        if (dropBeforeSend) { dropBeforeSend = false; throw new Error(); }
      }
      return transport(url, options);
    });
    await controller.boot(); await controller.select(validFile, base); await controller.submit();
    const key = controller.snapshot().operation?.key;
    await controller.refresh();
    assert.equal(controller.snapshot().fault, 'not-found-yet');
    assert.equal(controller.snapshot().operation?.phase, 'uncertain');
    assert.equal(controller.snapshot().operation?.key, key);
    assert.equal((await stats(base)).createRequests, 0);
    await controller.submit();
    assert.deepEqual(keys, [key, key]);
    assert.equal((await stats(base)).newJobs, 1);
  });
});

test('lost_ack immediate retry only looks up the existing job', async () => {
  await withServer(async base => {
    await scenario(base, 'lost_ack');
    const { controller } = setup(base);
    await controller.boot(); await controller.select(validFile, base); await controller.submit(); await controller.submit();
    assert.ok(controller.snapshot().operation?.job);
    assert.equal((await stats(base)).newJobs, 1);
    assert.equal((await stats(base)).createRequests, 1);
  });
});

test('stale_status ready/3 then processing/2 never rolls UI or persisted journal back', async () => {
  await withServer(async base => {
    const { controller, store } = setup(base);
    await controller.boot(); await controller.select(validFile, base); await controller.submit();
    await scenario(base, 'stale_status'); await controller.refresh();
    assert.equal(controller.snapshot().operation?.job?.status, 'ready');
    await controller.refresh();
    assert.equal(controller.snapshot().operation?.job?.revision, 3);
    assert.equal((await store.load())?.job?.status, 'ready');
  });
});

test('503 delete keeps truthful state; stable key survives relaunch; only subsequent GET confirms deleted', async () => {
  await withServer(async base => {
    const keys: string[] = [];
    const { controller, store, files } = setup(base, undefined, undefined, async (url, options) => {
      if (options.method === 'DELETE') keys.push(options.headers['Idempotency-Key']!);
      return transport(url, options);
    });
    await controller.boot(); await controller.select(validFile, base); await controller.submit();
    await scenario(base, 'delete_failure'); await controller.deleteImport();
    assert.equal(controller.snapshot().operation?.phase, 'delete_failed');
    assert.notEqual(controller.snapshot().operation?.job?.status, 'deleted');
    const deleteKey = (await store.load())?.deleteKey;
    controller.dispose();
    const restored = setup(base, store, files, async (url, options) => {
      if (options.method === 'DELETE') keys.push(options.headers['Idempotency-Key']!);
      return transport(url, options);
    }).controller;
    await restored.boot();
    assert.equal(restored.snapshot().operation?.phase, 'delete_failed');
    await scenario(base, 'happy'); await restored.deleteImport();
    assert.equal(restored.snapshot().operation?.phase, 'deleting');
    assert.deepEqual(keys, [deleteKey, deleteKey]);
    await pause(1050); await restored.refresh();
    assert.equal(restored.snapshot().operation?.phase, 'deleted');
    assert.equal((await store.load())?.job?.status, 'deleted');
  });
});

test('bad files rejected locally, bounded reads even with absent/false metadata; createRequests unchanged', async () => {
  await withServer(async base => {
    const before = await stats(base);
    const { controller, files } = setup(base);
    await controller.boot();
    const spoofed = await fixture('spoofed.pdf');
    files.bytes.set('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.bin', spoofed);
    await controller.select({ ...validFile, stagedId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.bin', name: 'spoofed.pdf', size: spoofed.length, format: 'pdf' }, base);
    assert.equal(controller.snapshot().fault, 'unsupported');
    assert.equal(controller.snapshot().operation, null);
    await controller.submit();
    assert.equal(controller.snapshot().fault, null); // submit with no operation is harmless
    const huge = new Uint8Array(MAX_BYTES + 1000); huge.set(csv);
    files.bytes.set('cccccccc-cccc-4ccc-8ccc-cccccccccccc.bin', huge);
    await controller.select({ ...validFile, stagedId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc.bin', size: huge.length }, base);
    assert.equal(controller.snapshot().fault, 'oversize');
    const metrics = { maxRead: 0, read: 0, closed: false };
    await assert.rejects(inspectFile(reader(huge, metrics), 1), { code: 'oversize' });
    assert.equal(metrics.read, MAX_BYTES + 1); assert.ok(metrics.maxRead <= 65536); assert.equal(metrics.closed, true);
    const metadataMetrics = { maxRead: 0, read: 0, closed: false };
    await assert.rejects(inspectFile(reader(huge, metadataMetrics), huge.length), { code: 'oversize' });
    assert.equal(metadataMetrics.read, 0); assert.equal(metadataMetrics.closed, true);
    assert.equal(controller.snapshot().operation, null);
    assert.equal((await stats(base)).createRequests, before.createRequests);
  });
});

test('accepts actual PDF fixture independent of extension; closes handles on failure', async () => {
  const pdf = await fixture('statement.pdf');
  assert.deepEqual(await inspectFile(reader(pdf)), { size: pdf.length, format: 'pdf' });
  const metrics = { maxRead: 0, read: 0, closed: false };
  await assert.rejects(inspectFile(reader(new Uint8Array([1, 2, 3]), metrics)), { code: 'unsupported' });
  assert.equal(metrics.closed, true);
});

test('persistence failure prevents POST; cancel removes private copy; simultaneous taps serialize', async () => {
  await withServer(async base => {
    const { controller, store, files } = setup(base);
    await controller.boot(); await controller.select(validFile, base);
    store.fail = true; await controller.submit();
    assert.equal(controller.snapshot().fault, 'storage');
    assert.equal((await stats(base)).createRequests, 0);
    store.fail = false;
    await Promise.all([controller.submit(), controller.submit()]);
    assert.equal((await stats(base)).newJobs, 1);
    const other = setup(base, new MemoryStore(), new TestFiles());
    await other.controller.boot(); await other.controller.select(validFile, base); await other.controller.cancelSelection();
    assert.equal(other.controller.snapshot().operation, null); assert.equal(other.files.bytes.size, 0);
    assert.equal(files.bytes.size, 0);
  });
});

test('cleanup failure remains recoverable after durable job acknowledgment', async () => {
  await withServer(async base => {
    const { controller, store, files } = setup(base); files.failRemove = true;
    await controller.boot(); await controller.select(validFile, base); await controller.submit();
    assert.equal(controller.snapshot().fault, 'cleanup');
    assert.ok((await store.load())?.job); assert.ok((await store.load())?.file);
    controller.dispose(); files.failRemove = false;
    const restored = setup(base, store, files).controller; await restored.boot();
    assert.equal((await store.load())?.file, undefined); assert.equal(files.bytes.size, 0);
    assert.equal((await stats(base)).createRequests, 1);
  });
});

test('missing selected cache is detected on boot and can be cancelled without POST or cleanup deadlock', async () => {
  await withServer(async base => {
    const { controller, store, files } = setup(base);
    await controller.boot(); await controller.select(validFile, base);
    controller.dispose(); files.bytes.clear();
    const restored = setup(base, store, files).controller;
    await restored.boot();
    assert.equal(restored.snapshot().booting, false);
    assert.equal(restored.snapshot().fault, 'file-missing');
    assert.equal(restored.snapshot().operation?.phase, 'selected');
    await restored.submit();
    assert.equal((await stats(base)).createRequests, 0);
    await restored.cancelSelection();
    assert.equal(restored.snapshot().fault, null);
    assert.equal(await store.load(), null);
    files.bytes.set(validFile.stagedId, csv);
    await restored.select(validFile, base);
    assert.equal(restored.snapshot().operation?.phase, 'selected');
    assert.equal((await stats(base)).createRequests, 0);
  });
});

test('lost ACK recovers its existing job even after the cached bytes have been evicted', async () => {
  await withServer(async base => {
    await scenario(base, 'lost_ack');
    const { controller, store, files } = setup(base);
    await controller.boot(); await controller.select(validFile, base); await controller.submit();
    const key = controller.snapshot().operation?.key;
    controller.dispose(); files.bytes.clear();
    const restored = setup(base, store, files).controller;
    await restored.boot();
    assert.equal(restored.snapshot().fault, null);
    assert.equal(restored.snapshot().operation?.key, key);
    assert.ok(restored.snapshot().operation?.job);
    assert.equal(restored.snapshot().operation?.file, undefined);
    assert.equal((await stats(base)).createRequests, 1);
    assert.equal((await stats(base)).newJobs, 1);
  });
});

test('missing bytes and lookup 404 never discard uncertain intent or open a new import', async () => {
  await withServer(async base => {
    const { controller, store, files } = setup(base, undefined, undefined, async (url, options) => {
      if (options.method === 'POST') throw new Error('lost before send');
      return transport(url, options);
    });
    await controller.boot(); await controller.select(validFile, base); await controller.submit();
    const key = controller.snapshot().operation?.key;
    controller.dispose(); files.bytes.clear();
    const restored = setup(base, store, files).controller;
    await restored.boot();
    assert.equal(restored.snapshot().fault, 'not-found-yet');
    await restored.cancelSelection();
    await restored.submit();
    assert.equal(restored.snapshot().fault, 'file-missing');
    assert.equal(restored.snapshot().operation?.key, key);
    assert.equal(restored.snapshot().operation?.phase, 'uncertain');
    assert.equal((await stats(base)).createRequests, 0);
  });
});

test('deleted tombstone and deletion barrier ignore late responses, including higher revision ready', () => {
  const deleted = parseJob({ jobId: 'job-demo-001', status: 'deleted', revision: 5 });
  const stale = parseJob({ jobId: 'job-demo-001', status: 'processing', revision: 2 });
  assert.equal(acceptJob(deleted, stale), deleted);
  assert.equal(acceptJob(deleted, { ...stale, revision: 99 }), deleted);
  const deleting = { ...deleted, status: 'deleting' as const, revision: 4 };
  assert.equal(acceptJob(deleting, { ...stale, revision: 99 }), deleting);
});

test('disposed controller cannot persist a late response over a relaunched controller', async () => {
  await withServer(async base => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let posted!: () => void;
    const reached = new Promise<void>(resolve => { posted = resolve; });
    const { controller, store, files } = setup(base, undefined, undefined, async (url, options) => {
      const response = await transport(url, options);
      if (options.method === 'POST') { posted(); await gate; }
      return response;
    });
    await controller.boot(); await controller.select(validFile, base);
    const submitting = controller.submit(); await reached; controller.dispose();
    const restored = setup(base, store, files).controller; await restored.boot();
    const saved = store.raw; release(); await submitting;
    assert.equal(store.raw, saved); assert.ok(restored.snapshot().operation?.job);
  });
});

test('corrupt journal blocks bootstrap rather than silently creating another job', async () => {
  const store = new MemoryStore(); store.raw = '{broken';
  const { controller } = setup('http://127.0.0.1:8787', store);
  await controller.boot();
  assert.equal(controller.snapshot().booting, true); assert.equal(controller.snapshot().fault, 'storage-corrupt');
  assert.throws(() => parseJob({ jobId: 'j', revision: 3, status: 'ready', currency: 'AUD', items: [{ amountMinor: -1 }] }));
});

test('307/308 redirects never forward raw document bytes or idempotency headers', async () => {
  let destinationRequests = 0;
  const destination = createServer((_req, res) => { destinationRequests++; res.end('{}'); });
  await new Promise<void>(resolve => destination.listen(0, '127.0.0.1', resolve));
  try {
    for (const code of [307, 308]) {
      const origin = createServer((req, res) => {
        req.resume();
        res.writeHead(code, { Location: `http://127.0.0.1:${(destination.address() as { port: number }).port}/external` });
        res.end();
      });
      await new Promise<void>(resolve => origin.listen(0, '127.0.0.1', resolve));
      try {
        const base = `http://127.0.0.1:${(origin.address() as { port: number }).port}`;
        const { controller } = setup(base);
        await controller.boot(); await controller.select(validFile, base); await controller.submit();
        assert.equal(controller.snapshot().fault, 'network');
        assert.equal(controller.snapshot().operation?.phase, 'uncertain');
      } finally { await new Promise<void>(resolve => origin.close(() => resolve())); }
    }
    assert.equal(destinationRequests, 0);
  } finally { await new Promise<void>(resolve => destination.close(() => resolve())); }
});

test('failed cleanup after confirmed deletion prevents overwriting the only retained file reference', async () => {
  const store = new MemoryStore(); const files = new TestFiles(); files.failRemove = true;
  await store.save({ version: 1, key: 'retained-create-key', baseUrl: 'http://127.0.0.1:8787', phase: 'deleted',
    file: validFile, job: { jobId: 'job-demo-001', revision: 5, status: 'deleted' } });
  const { controller } = setup('http://127.0.0.1:8787', store, files);
  await controller.boot();
  await controller.select(validFile, 'http://127.0.0.1:8787');
  assert.equal((await store.load())?.key, 'retained-create-key');
  assert.equal((await store.load())?.file?.stagedId, validFile.stagedId);
  files.failRemove = false; await controller.boot();
  assert.equal((await store.load())?.file, undefined);
});

test('setup/cleanup/setup during pending journal load leaves exactly one active bootstrap owner', async () => {
  let release!: (journal: Journal | null) => void;
  const loaded = new Promise<Journal | null>(resolve => { release = resolve; });
  const store = new MemoryStore();
  store.load = () => loaded;
  const files = new TestFiles();
  let sweeps = 0;
  files.sweep = async () => { sweeps += 1; };
  const first = setup('http://127.0.0.1:8787', store, files).controller;
  const discardedBoot = first.boot();
  first.dispose();
  const current = setup('http://127.0.0.1:8787', store, files).controller;
  const activeBoot = current.boot();
  release(null);
  await Promise.all([discardedBoot, activeBoot]);
  assert.equal(sweeps, 1);
  assert.equal(current.snapshot().booting, false);
  assert.equal(first.snapshot().booting, true);
});

test('disposing during asynchronous sweep prevents subsequent private-file cleanup', async () => {
  const store = new MemoryStore();
  await store.save({ version: 1, key: 'retained-create-key', baseUrl: 'http://127.0.0.1:8787', phase: 'active',
    file: validFile, job: { jobId: 'job-demo-001', status: 'queued', revision: 1 } });
  const files = new TestFiles();
  let started!: () => void;
  let release!: () => void;
  const sweeping = new Promise<void>(resolve => { started = resolve; });
  const finished = new Promise<void>(resolve => { release = resolve; });
  files.sweep = async () => { started(); await finished; };
  const { controller } = setup('http://127.0.0.1:8787', store, files);
  const boot = controller.boot();
  await sweeping;
  controller.dispose();
  release();
  await boot;
  assert.equal(files.bytes.has(validFile.stagedId), true);
  assert.equal((await MemoryStore.prototype.load.call(store))?.file?.stagedId, validFile.stagedId);
});

test('server error stops automatic polling, preserves the job, and remains deletable through HTTP', async () => {
  await withServer(async base => {
    let failProcessing = true;
    const { controller, files } = setup(base, new MemoryStore(), new TestFiles(), async (url, options) => {
      const response = await transport(url, options);
      if (failProcessing && options.method === 'GET' && /\/imports\/job-demo-/.test(url) && response.ok) {
        const job = await response.json() as Record<string, unknown>;
        return { ok: true, status: 200, json: async () => ({ ...job, status: 'error', revision: 3 }) };
      }
      return response;
    });
    await controller.boot(); await controller.select(validFile, base); await controller.submit();
    await controller.refresh();
    assert.equal(controller.snapshot().operation?.job?.status, 'error');
    assert.equal(controller.snapshot().operation?.phase, 'active');
    assert.equal(controller.snapshot().fault, null);
    assert.equal(controller.shouldPoll, false);
    assert.equal(files.bytes.size, 0);
    failProcessing = false;
    await controller.deleteImport();
    assert.notEqual(controller.snapshot().operation?.phase, 'deleted');
    await pause(1050); await controller.refresh();
    assert.equal(controller.snapshot().operation?.phase, 'deleted');
  });
});
