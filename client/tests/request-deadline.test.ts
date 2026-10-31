import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { HttpApi, type Transport } from '../src/core/api';
import { ImportController, type Files, type Store } from '../src/core/controller';
import type { Job, Journal, LocalFile } from '../src/core/model';
import { getImportPresentation, importMessages } from '../src/features/import/presentation';

const baseUrl = 'http://127.0.0.1:8787';
const file: LocalFile = { stagedId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.bin', name: 'statement.csv', size: 112, format: 'csv' };
const queued: Job = { jobId: 'job-timeout-001', status: 'queued', revision: 1 };
const ready: Job = { ...queued, status: 'ready', revision: 3, currency: 'AUD', items: [] };
const response = (job: Job) => ({ ok: true, status: 200, json: async () => job });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const drain = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
async function expire(t: TestContext, action: Promise<void>) {
  let settled = false;
  void action.then(() => { settled = true; });
  t.mock.timers.tick(12_000);
  await drain();
  assert.equal(settled, true, 'deadline must settle the action even when abort is ignored');
  await action;
}
function setup(transport: Transport, body = async (_file: LocalFile): Promise<unknown> => new Uint8Array(112), initial: Journal | null = null) {
  let saved = initial;
  const store: Store = {
    async load() { return structuredClone(saved); },
    async save(value) { saved = structuredClone(value); },
  };
  const removed: string[] = [];
  const files: Files = {
    async remove(value) { removed.push(value.stagedId); },
    async sweep() {}, async verify() {},
  };
  let key = 0;
  const controller = new ImportController(store, files, new HttpApi(transport, body), () => `deadline-stable-key-${++key}`, { async load() { return []; }, async save() {} });
  return { controller, store, removed };
}

for (const stage of ['headers', 'body'] as const) {
  test(`POST deadline covers hanging ${stage}; late completion cannot apply a job or duplicate POST`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const started = deferred<void>();
    const late = deferred<Job>();
    const calls: string[] = [];
    let signal: AbortSignal | undefined;
    const { controller, store, removed } = setup(async (_url, options) => {
      calls.push(options.method);
      if (options.method !== 'POST') return response(ready);
      signal = options.signal;
      if (stage === 'headers') { started.resolve(); return response(await late.promise); }
      return { ok: true, status: 202, json: () => { started.resolve(); return late.promise; } };
    });
    try {
      await controller.boot(); await controller.select(file, baseUrl);
      const key = controller.snapshot().operation?.key;
      const submitting = controller.submit(); await started.promise;
      await expire(t, submitting);
      assert.equal(signal?.aborted, true);
      assert.equal(controller.snapshot().fault, 'timeout');
      assert.equal(controller.snapshot().busy, false);
      assert.equal((await store.load())?.phase, 'uncertain');
      assert.equal((await store.load())?.key, key);
      assert.deepEqual((await store.load())?.file, file);
      assert.deepEqual(removed, []);
      const view = getImportPresentation(controller.snapshot());
      assert.equal(view.busy, false); assert.equal(view.spinning, false);
      assert.equal(view.retryUpload, true); assert.equal(view.canPick, false);
      assert.ok(importMessages[view.fault!]);
      const timedOut = structuredClone(controller.snapshot());
      late.resolve(queued); await drain();
      assert.deepEqual(controller.snapshot(), timedOut);
      await controller.submit();
      assert.deepEqual(calls, ['POST', 'GET']);
      assert.equal(controller.snapshot().operation?.key, key);
      assert.equal(controller.snapshot().operation?.job?.status, 'ready');
      assert.deepEqual(removed, [file.stagedId]);
    } finally { controller.dispose(); late.resolve(queued); }
  });
}

test('body preparation is bounded and cannot start POST after its deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const started = deferred<void>();
  const late = deferred<unknown>();
  let requests = 0;
  const { controller, store } = setup(async () => { requests++; return response(queued); }, () => {
    started.resolve(); return late.promise;
  });
  try {
    await controller.boot(); await controller.select(file, baseUrl);
    const submitting = controller.submit(); await started.promise;
    await expire(t, submitting);
    assert.equal(controller.snapshot().fault, 'timeout');
    assert.equal((await store.load())?.phase, 'uncertain');
    late.resolve(new Uint8Array(112)); await drain();
    assert.equal(requests, 0);
    assert.equal(controller.snapshot().operation?.job, undefined);
  } finally { controller.dispose(); late.resolve(undefined); }
});

test('GET deadline releases restored uncertain operation without changing its key or sending bytes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const started = deferred<void>();
  const late = deferred<Job>();
  const calls: string[] = [];
  const initial: Journal = { version: 1, key: 'original-uncertain-key', baseUrl, phase: 'uncertain', file };
  const { controller, store } = setup(async (_url, options) => {
    calls.push(options.method);
    if (calls.length === 1) { started.resolve(); return response(await late.promise); }
    return response(ready);
  }, undefined, initial);
  try {
    const booting = controller.boot(); await started.promise;
    await expire(t, booting);
    assert.equal(controller.snapshot().booting, false);
    assert.equal(controller.snapshot().busy, false);
    assert.equal(controller.snapshot().fault, 'timeout');
    assert.deepEqual(await store.load(), initial);
    late.resolve(queued); await drain();
    assert.deepEqual(await store.load(), initial);
    await controller.refresh();
    assert.deepEqual(calls, ['GET', 'GET']);
    assert.equal(controller.snapshot().operation?.key, initial.key);
    assert.equal(controller.snapshot().operation?.job?.status, 'ready');
  } finally { controller.dispose(); late.resolve(queued); }
});

test('DELETE deadline preserves its key; late deleted response cannot replace GET confirmation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const started = deferred<void>();
  const late = deferred<Job>();
  const keys: string[] = [];
  let gets = 0;
  const { controller, store } = setup(async (_url, options) => {
    if (options.method === 'POST') return response(queued);
    if (options.method === 'DELETE') {
      keys.push(options.headers['Idempotency-Key']!);
      if (keys.length === 1) { started.resolve(); return response(await late.promise); }
      return response({ ...queued, status: 'deleted', revision: 4 });
    }
    return response({ ...queued, status: ++gets === 1 ? 'deleting' : 'deleted', revision: gets + 1 });
  });
  try {
    await controller.boot(); await controller.select(file, baseUrl); await controller.submit();
    const deleting = controller.deleteImport(); await started.promise;
    await expire(t, deleting);
    assert.equal(controller.snapshot().busy, false);
    assert.equal(controller.snapshot().fault, 'timeout');
    assert.equal((await store.load())?.phase, 'delete_failed');
    assert.equal((await store.load())?.job?.status, 'queued');
    const timedOut = structuredClone(await store.load());
    late.resolve({ ...queued, status: 'deleted', revision: 99 }); await drain();
    assert.deepEqual(await store.load(), timedOut);
    await controller.deleteImport();
    assert.deepEqual(keys, [timedOut?.deleteKey, timedOut?.deleteKey]);
    assert.equal(controller.snapshot().operation?.phase, 'deleting');
    assert.equal(controller.snapshot().operation?.job?.status, 'deleting');
    await controller.refresh();
    assert.equal(controller.snapshot().operation?.phase, 'deleted');
  } finally { controller.dispose(); late.resolve(queued); }
});

test('completed request clears its timer without later aborting or faulting the operation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | undefined;
  const { controller } = setup(async (_url, options) => { signal = options.signal; return response(queued); });
  try {
    await controller.boot(); await controller.select(file, baseUrl); await controller.submit();
    const before = structuredClone(controller.snapshot());
    t.mock.timers.tick(12_000); await drain();
    assert.equal(signal?.aborted, false);
    assert.deepEqual(controller.snapshot(), before);
  } finally { controller.dispose(); }
});
