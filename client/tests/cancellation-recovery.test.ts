import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpApi, type Transport } from '../src/core/api';
import { ImportController } from '../src/core/controller';
import type { Journal, Job, LocalFile } from '../src/core/model';
import type { PendingCancellation } from '../src/core/cancellations';
import { CancellationRecovery } from '../src/features/import/cancellationRecovery';
import { getImportPresentation } from '../src/features/import/presentation';

const pending: PendingCancellation = {
  key: 'original-create-key',
  baseUrl: 'http://127.0.0.1:8787',
  deleteKey: 'original-delete-key',
};
const queued: Job = { jobId: 'synthetic-job', status: 'queued', revision: 1 };
const file: LocalFile = {
  stagedId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.bin',
  name: 'synthetic.csv',
  size: 112,
  format: 'csv',
};
const reply = (job: Job) => ({ ok: true, status: 200, json: async () => job });
const drain = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
};
function setup(transport: Transport, operation: Journal | null = null) {
  const durable = { operation, entries: [structuredClone(pending)] };
  const controller = new ImportController(
    {
      async load() { return structuredClone(durable.operation); },
      async save(value) { durable.operation = structuredClone(value); },
    },
    { async verify() {}, async remove() {}, async sweep() {} },
    new HttpApi(transport, async () => new Uint8Array(112)),
    () => 'new-explicit-create-key',
    {
      async load() { return structuredClone(durable.entries); },
      async save(value) { durable.entries = structuredClone(value); },
    },
  );
  return { controller, durable };
}

test('startup quietly recovers cancellation and polls until GET confirms deleted', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const methods: string[] = [];
  let deleted = false;
  const s = setup(async (_url, options) => {
    methods.push(options.method);
    if (options.method === 'DELETE') {
      assert.equal(options.headers['Idempotency-Key'], pending.deleteKey);
      return reply({ ...queued, status: 'deleting', revision: 2 });
    }
    return reply(deleted ? { ...queued, status: 'deleted', revision: 3 } : queued);
  });
  const recovery = new CancellationRecovery(s.controller);
  try {
    t.mock.timers.tick(10_000); await drain();
    assert.deepEqual(methods, [], 'bootstrap must finish first');
    await s.controller.boot();
    t.mock.timers.tick(1_500); await drain();
    assert.deepEqual(methods, ['GET', 'DELETE', 'GET']);
    assert.equal(s.durable.entries.length, 1);
    assert.equal(getImportPresentation(s.controller.snapshot()).cancellationIssue, null);
    deleted = true;
    t.mock.timers.tick(1_500); await drain();
    assert.deepEqual(methods, ['GET', 'DELETE', 'GET', 'GET']);
    assert.deepEqual(s.durable.entries, []);
    t.mock.timers.tick(60_000); await drain();
    assert.equal(methods.length, 4, 'completed recovery stops scheduling');
  } finally { await recovery.stop(); s.controller.dispose(); }
});

test('not-found remains silent and durable, with bounded retries until next foreground session', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let gets = 0;
  const s = setup(async (_url, options) => {
    assert.equal(options.method, 'GET'); gets++;
    return { ok: false, status: 404, json: async () => null };
  });
  let recovery = new CancellationRecovery(s.controller);
  try {
    await s.controller.boot();
    for (let i = 0; i < 5; i++) { t.mock.timers.tick(1_500); await drain(); }
    assert.equal(gets, 3);
    assert.deepEqual(s.durable.entries, [pending]);
    assert.equal(getImportPresentation(s.controller.snapshot()).cancellationIssue, null);
    await recovery.stop();
    t.mock.timers.tick(60_000); await drain(); assert.equal(gets, 3);
    recovery = new CancellationRecovery(s.controller);
    t.mock.timers.tick(1_500); await drain(); assert.equal(gets, 4);
  } finally { await recovery.stop(); s.controller.dispose(); }
});

test('delayed offline recovery stays quiet, retains its key and remains retryable', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let reachable = false;
  let gets = 0;
  const s = setup(async (_url, options) => {
    assert.equal(options.method, 'GET'); gets++;
    if (!reachable) throw new Error('offline');
    return reply({ ...queued, status: 'deleted', revision: 3 });
  });
  const recovery = new CancellationRecovery(s.controller);
  try {
    await s.controller.boot(); t.mock.timers.tick(1_500); await drain();
    assert.equal(gets, 1);
    const view = getImportPresentation(s.controller.snapshot());
    assert.equal(view.cancellationIssue, null);
    assert.equal(view.canPick, true);
    assert.equal(view.isDeleted, false);
    assert.equal(s.controller.snapshot().cancellationFault, 'network');
    assert.deepEqual(s.durable.entries, [pending]);
    t.mock.timers.tick(60_000); await drain(); assert.equal(gets, 1);
    reachable = true; recovery.retry();
    t.mock.timers.tick(1_500); await drain();
    assert.equal(gets, 2); assert.deepEqual(s.durable.entries, []);
    assert.equal(getImportPresentation(s.controller.snapshot()).cancellationIssue, null);
  } finally { await recovery.stop(); s.controller.dispose(); }
});

test('a background timeout never appears as a delayed Home error or forgets the cancellation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = setup(async () => new Promise(() => {}));
  const recovery = new CancellationRecovery(s.controller);
  try {
    await s.controller.boot();
    t.mock.timers.tick(1_500); await drain();
    assert.equal(s.controller.snapshot().checkingCancellations, true);
    t.mock.timers.tick(12_000); await drain();
    assert.equal(s.controller.snapshot().cancellationFault, 'timeout');
    const view = getImportPresentation(s.controller.snapshot());
    assert.equal(view.cancellationIssue, null);
    assert.equal(view.canPick, true);
    assert.deepEqual(s.durable.entries, [pending]);
  } finally { await recovery.stop(); s.controller.dispose(); }
});

test('hanging check yields immediately to picker and ignores its late response', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolve!: (job: Job) => void;
  const late = new Promise<Job>(done => { resolve = done; });
  let gets = 0;
  const s = setup(async (_url, options) => {
    assert.equal(options.method, 'GET'); gets++;
    return reply(await late);
  });
  const recovery = new CancellationRecovery(s.controller);
  try {
    await s.controller.boot(); t.mock.timers.tick(1_500); await drain();
    assert.equal(gets, 1); assert.equal(s.controller.snapshot().checkingCancellations, true);
    assert.equal(getImportPresentation(s.controller.snapshot()).busy, false);
    assert.equal(getImportPresentation(s.controller.snapshot()).canPick, true);
    await recovery.stop();
    assert.equal(s.controller.snapshot().busy, false);
    assert.equal(getImportPresentation(s.controller.snapshot()).cancellationIssue, null);
    await s.controller.select(file, pending.baseUrl);
    const saved = structuredClone(s.durable);
    resolve({ ...queued, status: 'deleted', revision: 3 }); await drain();
    t.mock.timers.tick(60_000); await drain();
    assert.deepEqual(s.durable, saved);
    assert.equal(s.durable.operation?.phase, 'selected');
    assert.equal(gets, 1);
  } finally { resolve(queued); await recovery.stop(); s.controller.dispose(); }
});

test('a new cancellation starts recovery, while active imports and their polling take precedence', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const methods: string[] = [];
  const selected: Journal = { version: 1, key: 'new-create-key', baseUrl: pending.baseUrl, phase: 'selected', file };
  const s = setup(async (_url, options) => {
    methods.push(options.method);
    return reply(options.method === 'POST' ? queued : { ...queued, status: 'deleted', revision: 3 });
  }, selected);
  const recovery = new CancellationRecovery(s.controller);
  try {
    await s.controller.boot(); t.mock.timers.tick(60_000); await drain();
    assert.deepEqual(methods, []);
    await s.controller.submit(); t.mock.timers.tick(60_000); await drain();
    assert.deepEqual(methods, ['POST']); assert.equal(s.controller.shouldPoll, true);
    await s.controller.cancelImport();
    t.mock.timers.tick(1_500); await drain();
    assert.deepEqual(methods, ['POST', 'GET', 'GET']);
    assert.equal(s.durable.operation, null); assert.deepEqual(s.durable.entries, []);
  } finally { await recovery.stop(); s.controller.dispose(); }
});
