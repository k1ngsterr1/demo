import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpApi, type Transport } from '../src/core/api';
import { ImportController, type Store, type Files } from '../src/core/controller';
import { MAX_PENDING_CANCELLATIONS, parsePendingCancellations, type PendingCancellation, type PendingCancellationStore } from '../src/core/cancellations';
import { Fault, type Journal, type Job, type LocalFile } from '../src/core/model';
import { getImportRoute } from '../src/features/import/navigation';
import { getImportPresentation } from '../src/features/import/presentation';

const baseUrl = 'http://127.0.0.1:8787';
const file: LocalFile = { stagedId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.bin', name: 'synthetic.csv', size: 112, format: 'csv' };
const queued: Job = { jobId: 'cancel-job', revision: 1, status: 'queued' };
const pending = (key = 'original-create-key'): PendingCancellation => ({ key, baseUrl, deleteKey: 'stable-delete-key' });
const journal = (): Journal => ({ version: 1, ...pending(), phase: 'uncertain', file });
const response = (job: Job | null) => ({ ok: !!job, status: job ? 200 : 404, json: async () => job });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const drain = async () => { for (let i = 0; i < 64; i++) await Promise.resolve(); };
function setup(transport: Transport, initial: Journal | null = null, entries: PendingCancellation[] = [], body = async (): Promise<unknown> => new Uint8Array(112)) {
  const durable = { current: structuredClone(initial), pending: structuredClone(entries) };
  const failure = { savePending: false as boolean | Error, remove: false, clear: false };
  const events: string[] = [];
  const live = new Set(initial?.file ? [initial.file.stagedId] : []);
  const store: Store = { async load() { return structuredClone(durable.current); }, async save(op) {
    if (!op && failure.clear) throw new Error('clear');
    events.push(op ? 'current-save' : 'current-clear'); durable.current = structuredClone(op);
  } };
  const cancellations: PendingCancellationStore = { async load() { return structuredClone(durable.pending); }, async save(value) {
    if (failure.savePending) throw failure.savePending instanceof Error ? failure.savePending : new Error('pending');
    events.push('pending-save'); durable.pending = structuredClone(value);
  } };
  const files: Files = { async verify(value) { live.add(value.stagedId); }, async sweep() {}, async remove(value) {
    if (failure.remove) throw new Error('remove'); events.push('file-remove'); live.delete(value.stagedId);
  } };
  let key = 0;
  const make = () => new ImportController(store, files, new HttpApi(transport, body), () => `generated-key-${++key}`, cancellations);
  const controller = make();
  return { controller, make, durable, failure, events, live };
}

for (const stage of ['headers', 'body'] as const) test(`cancel hanging POST ${stage} immediately; preserve key, clear copy, ignore late ACK and allow new selection`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const started = deferred<void>(); const late = deferred<Job>(); let posts = 0;
  const s = setup(async (_url, options) => {
    assert.equal(options.method, 'POST'); posts++;
    if (stage === 'headers') { started.resolve(); return response(await late.promise); }
    return { ok: true, status: 202, json: () => { started.resolve(); return late.promise; } };
  });
  try {
    await s.controller.boot(); await s.controller.select(file, baseUrl);
    const key = s.durable.current!.key;
    const submit = s.controller.submit(); await started.promise;
    let done = false;
    const cancel = s.controller.cancelImport().then(() => { done = true; });
    const duplicate = s.controller.cancelImport();
    await s.controller.submit(); await s.controller.refresh();
    await drain(); assert.equal(done, true, 'Cancel must not wait for timeout or native abort');
    await Promise.all([submit, cancel, duplicate]);
    assert.equal(s.durable.current, null); assert.equal(s.live.size, 0);
    assert.equal(s.durable.pending.length, 1); assert.equal(s.durable.pending[0]!.key, key);
    assert.deepEqual(s.events.slice(-3), ['pending-save', 'file-remove', 'current-clear']);
    assert.equal(getImportRoute(s.controller.snapshot()), 'ImportHome');
    const before = structuredClone(s.controller.snapshot());
    late.resolve(queued); await drain(); assert.deepEqual(s.controller.snapshot(), before);
    await s.controller.select(file, baseUrl); assert.equal(s.controller.snapshot().operation?.phase, 'selected');
    assert.equal(posts, 1);
  } finally { s.controller.dispose(); late.resolve(queued); }
});

test('cancel during body preparation never starts a late POST', async () => {
  const started = deferred<void>(); const body = deferred<unknown>(); let posts = 0;
  const s = setup(async () => { posts++; return response(queued); }, null, [], () => { started.resolve(); return body.promise; });
  try {
    await s.controller.boot(); await s.controller.select(file, baseUrl);
    const submit = s.controller.submit(); await started.promise;
    await s.controller.cancelImport(); await submit;
    body.resolve(new Uint8Array(112)); await drain();
    assert.equal(posts, 0); assert.equal(s.durable.current, null); assert.equal(s.durable.pending.length, 1);
  } finally { s.controller.dispose(); body.resolve(undefined); }
});

test('ACK before cancel archives job metadata without report, filename or file reference', async () => {
  const s = setup(async () => response({ ...queued, status: 'ready', currency: 'AUD', items: [] }));
  try {
    await s.controller.boot(); await s.controller.select(file, baseUrl); await s.controller.submit(); await s.controller.cancelImport();
    assert.deepEqual(s.durable.pending[0]!.job, { jobId: queued.jobId, status: 'ready', revision: 1 });
    assert.equal(JSON.stringify(s.durable.pending).includes(file.name), false);
    assert.equal(JSON.stringify(s.durable.pending).includes('items'), false);
    assert.equal(s.durable.current, null);
  } finally { s.controller.dispose(); }
});

for (const failAt of ['savePending', 'remove', 'clear'] as const) test(`cancellation ${failAt} failure remains recoverable after cold boot and cannot resend`, async () => {
  let requests = 0;
  const s = setup(async () => { requests++; return response(null); }, journal());
  try {
    await s.controller.boot(); requests = 0; s.failure[failAt] = true;
    await s.controller.cancelImport();
    assert.ok(s.durable.current);
    if (failAt === 'savePending') { assert.equal(s.durable.pending.length, 0); assert.equal(s.live.size, 1); }
    else {
      assert.equal(s.durable.pending.length, 1);
      assert.equal(getImportRoute(s.controller.snapshot()), 'Cleanup');
      await s.controller.submit(); await s.controller.deleteImport();
      assert.equal(requests, 0); assert.equal(s.controller.shouldPoll, false);
    }
    s.controller.dispose(); s.failure[failAt] = false;
    const next = s.make(); await next.boot();
    if (failAt === 'savePending') { assert.equal(next.snapshot().operation?.phase, 'uncertain'); await next.cancelImport(); }
    assert.equal(s.durable.current, null); assert.equal(s.durable.pending.length, 1); assert.equal(s.live.size, 0);
    assert.equal(next.snapshot().busy, false); next.dispose();
  } finally { s.controller.dispose(); }
});

test('boot overlapping cancellation retries local cleanup without HTTP or submit', async () => {
  let requests = 0; const s = setup(async () => { requests++; return response(queued); }, journal(), [pending()]);
  try {
    s.failure.remove = true; await s.controller.boot(); await s.controller.submit(); await s.controller.refresh(); await s.controller.reconcileCancellations();
    assert.equal(requests, 0); assert.ok(s.durable.current); assert.equal(s.controller.shouldPoll, false);
    s.failure.remove = false; await s.controller.boot();
    assert.equal(s.durable.current, null); assert.equal(s.durable.pending.length, 1); assert.equal(requests, 0);
  } finally { s.controller.dispose(); }
});

test('404 retains cancellation through relaunch and permits a different explicit import', async () => {
  const methods: string[] = []; const s = setup(async (_url, options) => { methods.push(options.method); return response(null); }, null, [pending()]);
  try {
    await s.controller.boot(); assert.deepEqual(methods, []);
    await s.controller.reconcileCancellations(); assert.equal(s.durable.pending.length, 1);
    assert.equal(s.controller.snapshot().cancellationFault, 'cancel-not-found');
    await s.controller.select(file, baseUrl); assert.equal(s.durable.current?.phase, 'selected');
    s.controller.dispose(); const next = s.make(); await next.boot();
    assert.deepEqual(methods, ['GET']); assert.equal(next.snapshot().pendingCancellations.length, 1); next.dispose();
  } finally { s.controller.dispose(); }
});

test('found job and stable delete key must be durable before DELETE; new current journal stays untouched', async () => {
  const methods: string[] = []; const s = setup(async (_url, options) => {
    methods.push(options.method);
    if (options.method === 'DELETE') {
      assert.equal(s.durable.pending[0]!.job?.jobId, queued.jobId);
      assert.equal(options.headers['Idempotency-Key'], s.durable.pending[0]!.deleteKey);
      return response({ ...queued, status: 'deleting', revision: 2 });
    }
    return response(queued);
  }, null, [pending()]);
  try {
    await s.controller.boot(); await s.controller.select(file, baseUrl); const current = structuredClone(s.durable.current);
    s.failure.savePending = true; await s.controller.reconcileCancellations(); assert.deepEqual(methods, ['GET']);
    s.failure.savePending = false; await s.controller.reconcileCancellations();
    assert.deepEqual(methods, ['GET', 'GET', 'DELETE', 'GET']);
    assert.equal(s.durable.pending[0]!.job?.status, 'deleting', 'stale GET cannot regress deletion');
    assert.deepEqual(s.durable.current, current);
  } finally { s.controller.dispose(); }
});

test('lost DELETE ACK retries same delete key; DELETE deleted is insufficient without GET deleted', async () => {
  const keys: string[] = []; let phase = 0;
  const s = setup(async (_url, options) => {
    if (options.method === 'DELETE') {
      keys.push(options.headers['Idempotency-Key']!);
      if (keys.length === 1) throw new Error('lost ACK');
      phase = 1; return response({ ...queued, status: 'deleted', revision: 3 });
    }
    return response(phase === 2 ? { ...queued, status: 'deleted', revision: 3 } : queued);
  }, null, [pending()]);
  try {
    await s.controller.boot(); await s.controller.reconcileCancellations(); assert.equal(s.durable.pending.length, 1);
    await s.controller.reconcileCancellations(); assert.equal(s.durable.pending.length, 1);
    assert.deepEqual(keys, ['stable-delete-key', 'stable-delete-key']);
    phase = 2; await s.controller.reconcileCancellations(); assert.equal(s.durable.pending.length, 0);
  } finally { s.controller.dispose(); }
});

for (const stage of ['lookup', 'delete', 'confirmation'] as const) {
  for (const failure of ['network', 'http-503', 'bad-response', 'timeout', 'wrong-job'] as const) {
    test(`${stage} ${failure} keeps its cancellation recoverable while the next server completes deletion`, async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] });
      const first = { ...pending('first-create-key'), ...(failure === 'wrong-job' ? { job: queued } : {}) };
      const second = { ...pending('second-create-key'), baseUrl: 'http://192.168.1.2:8787', deleteKey: 'second-delete-key' };
      const started = deferred<void>(); const late = deferred<Job>();
      const calls: string[] = []; let firstCalls = 0; let secondCalls = 0;
      const failingCall = stage === 'lookup' ? 1 : stage === 'delete' ? 2 : 3;
      const s = setup(async (url, options) => {
        const isFirst = url.startsWith(first.baseUrl + '/');
        calls.push(`${isFirst ? 'first' : 'second'}:${options.method}`);
        if (isFirst && ++firstCalls === failingCall) {
          if (failure === 'network') throw new Error('unreachable server');
          if (failure === 'http-503') return { ok: false, status: 503, json: async () => null };
          if (failure === 'bad-response') return { ok: true, status: 200, json: async () => ({ ...queued, status: ['queued'] }) };
          if (failure === 'wrong-job') return response({ ...queued, jobId: 'different-job' });
          started.resolve(); return response(await late.promise);
        }
        if (isFirst) return response(queued);
        secondCalls++;
        if (options.method === 'DELETE') {
          assert.equal(options.headers['Idempotency-Key'], second.deleteKey);
          return response({ ...queued, status: 'deleting', revision: 2 });
        }
        return response(secondCalls === 1 ? queued : { ...queued, status: 'deleted', revision: 3 });
      }, null, [first, second]);
      try {
        await s.controller.boot();
        const check = s.controller.reconcileCancellations();
        if (failure === 'timeout') { await started.promise; t.mock.timers.tick(12_000); }
        await check;
        assert.deepEqual(calls.slice(failingCall), ['second:GET', 'second:DELETE', 'second:GET']);
        assert.equal(s.controller.snapshot().cancellationFault, failure);
        assert.equal(s.controller.snapshot().busy, false);
        assert.equal(s.controller.snapshot().checkingCancellations, false);
        assert.deepEqual(s.durable.pending.map(entry => entry.key), [first.key]);
        assert.equal(s.durable.pending[0]!.deleteKey, first.deleteKey);
        const saved = structuredClone(s.durable.pending);
        late.resolve({ ...queued, status: 'deleted', revision: 3 }); await drain();
        assert.deepEqual(s.durable.pending, saved);
        s.controller.dispose(); const next = s.make();
        try { await next.boot(); assert.deepEqual(next.snapshot().pendingCancellations, saved); }
        finally { next.dispose(); }
      } finally { s.controller.dispose(); late.resolve(queued); }
    });
  }
}

for (const error of [new Error('disk failure'), new Fault('storage'), new Fault('storage-corrupt')]) test(`${error.message} stops the entire reconciliation before DELETE or the next entry`, async () => {
  const calls: string[] = []; const entries = [pending('first-create-key'), pending('second-create-key')];
  const s = setup(async (url, options) => { calls.push(`${options.method} ${url}`); return response(queued); }, null, entries);
  try {
    await s.controller.boot(); s.failure.savePending = error;
    await s.controller.reconcileCancellations();
    assert.deepEqual(calls, [`GET ${baseUrl}/imports/by-key/first-create-key`]);
    assert.equal(s.controller.snapshot().cancellationFault, error instanceof Fault ? error.code : 'storage');
    assert.equal(s.controller.snapshot().busy, false);
    assert.deepEqual(s.durable.pending, entries);
  } finally { s.controller.dispose(); }
});

test('stop after saving recovered job prevents DELETE and the next cancellation', async () => {
  const methods: string[] = [];
  const s = setup(async (_url, options) => { methods.push(options.method); return response(queued); }, null, [pending(), pending('second-create-key')]);
  const unsubscribe = s.controller.subscribe(() => {
    const state = s.controller.snapshot();
    if (state.checkingCancellations && state.pendingCancellations[0]?.job) s.controller.stopWaiting();
  });
  try {
    await s.controller.boot(); await s.controller.reconcileCancellations();
    assert.deepEqual(methods, ['GET']);
    assert.equal(s.controller.snapshot().cancellationFault, 'wait-stopped');
    assert.equal(s.controller.snapshot().busy, false);
    assert.equal(s.durable.pending.length, 2);
    assert.deepEqual(s.durable.pending[0]!.job, queued);
  } finally { unsubscribe(); s.controller.dispose(); }
});

test('malformed POST status stops the spinner and preserves recovery intent without resending', async () => {
  let posts = 0;
  const s = setup(async () => { posts++; return { ok: true, status: 202, json: async () => ({ ...queued, status: ['queued'] }) }; });
  try {
    await s.controller.boot(); await s.controller.select(file, baseUrl);
    const key = s.durable.current!.key; await s.controller.submit();
    assert.equal(s.controller.snapshot().fault, 'bad-response');
    assert.equal(s.controller.snapshot().busy, false);
    assert.equal(getImportPresentation(s.controller.snapshot()).spinning, false);
    assert.equal(s.controller.shouldPoll, false);
    assert.equal(s.durable.current?.phase, 'uncertain');
    assert.equal(s.durable.current?.key, key);
    assert.deepEqual(s.durable.current?.file, file);
    assert.equal(s.durable.current?.job, undefined);
    assert.equal(posts, 1);
  } finally { s.controller.dispose(); }
});

test('stop hanging reconciliation immediately retains every entry and ignores late deleted response', async () => {
  const started = deferred<void>(); const late = deferred<Job>();
  let requests = 0; const entries = [pending(), pending('second-create-key')];
  const s = setup(async () => { requests++; started.resolve(); return response(await late.promise); }, null, entries);
  try {
    await s.controller.boot(); const check = s.controller.reconcileCancellations(); await started.promise;
    s.controller.stopWaiting(); await check;
    assert.equal(s.controller.snapshot().busy, false); assert.equal(s.controller.snapshot().checkingCancellations, false);
    assert.equal(s.controller.snapshot().cancellationFault, 'wait-stopped');
    assert.deepEqual(s.durable.pending, entries); assert.equal(requests, 1);
    late.resolve({ ...queued, status: 'deleted', revision: 3 }); await drain(); assert.deepEqual(s.durable.pending, entries);
  } finally { s.controller.dispose(); late.resolve(queued); }
});

test('capacity never evicts cancellation keys and reserves final slot before POST', async () => {
  let requests = 0; const entries = Array.from({ length: MAX_PENDING_CANCELLATIONS }, (_, i) => pending(`original-key-${i}`));
  const s = setup(async () => { requests++; return response(null); }, null, entries);
  try {
    await s.controller.boot(); await s.controller.select(file, baseUrl); await s.controller.submit();
    assert.equal(s.durable.current, null); assert.equal(requests, 0); assert.deepEqual(s.durable.pending, entries);
    s.controller.dispose(); s.durable.pending.pop(); const next = s.make(); await next.boot();
    await next.select(file, baseUrl); await next.submit(); await next.cancelImport();
    assert.equal(s.durable.pending.length, MAX_PENDING_CANCELLATIONS); assert.equal(s.durable.current, null); next.dispose();
  } finally { s.controller.dispose(); }
});

test('metadata parser strips private fields and rejects corrupt, duplicate and overflowing records', () => {
  const raw = { version: 1, entries: [{ ...pending(), file, name: file.name, job: { ...queued, items: [] } }] };
  assert.deepEqual(parsePendingCancellations(JSON.stringify(raw)), [{ ...pending(), job: queued }]);
  for (const value of [null, {}, { version: 2, entries: [] }, { version: 1, entries: [pending(), pending()] },
    { version: 1, entries: [{ ...pending(), baseUrl: 'https://example.com' }] },
    { version: 1, entries: [{ ...pending(), key: 'x'.repeat(129) }] },
    { version: 1, entries: [{ ...pending(), deleteKey: 'x'.repeat(129) }] },
    { version: 1, entries: Array.from({ length: 33 }, (_, i) => pending(`overflow-${i}`)) }]) {
    assert.throws(() => parsePendingCancellations(JSON.stringify(value)), (error: unknown) => error instanceof Fault && error.code === 'storage-corrupt');
  }
});

test('already aborted request never transports bytes and success removes abort listener and deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0; let nativeSignal: AbortSignal | undefined;
  const api = new HttpApi(async (_url, options) => { calls++; nativeSignal = options.signal; return response(queued); }, async () => new Uint8Array(112));
  const stopped = new AbortController(); stopped.abort();
  await assert.rejects(api.create(journal(), stopped.signal), (error: unknown) => error instanceof Fault && error.code === 'wait-stopped');
  assert.equal(calls, 0);
  const completed = new AbortController(); await api.create(journal(), completed.signal); completed.abort();
  t.mock.timers.tick(12_000); await drain(); assert.equal(nativeSignal?.aborted, false); assert.equal(calls, 1);
});

test('lifecycle cancellation interrupt never aborts an explicit POST', async () => {
  const started = deferred<void>(); const late = deferred<Job>();
  let signal: AbortSignal | undefined;
  const s = setup(async (_url, options) => {
    assert.equal(options.method, 'POST');
    signal = options.signal; started.resolve(); return response(await late.promise);
  });
  try {
    await s.controller.boot(); await s.controller.select(file, baseUrl);
    const submit = s.controller.submit(); await started.promise;
    await s.controller.interruptCancellationCheck();
    assert.equal(signal?.aborted, false);
    assert.equal(s.controller.snapshot().busy, true);
    assert.equal(s.durable.current?.phase, 'uncertain');
    await s.controller.cancelImport(); await submit;
    assert.equal(s.durable.pending.length, 1);
  } finally { s.controller.dispose(); late.resolve(queued); }
});
