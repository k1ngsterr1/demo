import test from 'node:test';
import assert from 'node:assert/strict';
import type { Snapshot } from '../src/core/controller';
import type { Journal, Job } from '../src/core/model';
import { getImportRoute } from '../src/features/import/navigation';

const operation: Journal = { version: 1, key: 'one-operation', baseUrl: 'http://127.0.0.1:8787', phase: 'active' };
const snapshot = (op: Journal | null, booting = false): Snapshot => ({ operation: op, booting, busy: false, fault: null, pendingCancellations: [], cancelling: false, checkingCancellations: false, cancellationFault: null });
const job = (status: Job['status']): Job => ({ jobId: 'job-demo-001', status, revision: 3 });

test('restoration gates navigation even when a journal has already been loaded', () => {
  assert.equal(getImportRoute(snapshot(null, true)), 'Restore');
  assert.equal(getImportRoute(snapshot({ ...operation, job: job('ready') }, true)), 'Restore');
  assert.equal(getImportRoute({ ...snapshot(null, true), fault: 'storage-corrupt' }), 'Restore');
});

test('only idle, cancelled or fully cleaned deleted imports expose the file picker', () => {
  assert.equal(getImportRoute(snapshot(null)), 'ImportHome');
  assert.equal(getImportRoute(snapshot({ ...operation, phase: 'selected' })), 'Confirmation');
  const deleted: Journal = { ...operation, phase: 'deleted', job: job('deleted') };
  assert.equal(getImportRoute(snapshot(deleted)), 'ImportHome');
  assert.equal(getImportRoute(snapshot({ ...deleted, file: { stagedId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.bin', name: 'statement.csv', size: 112, format: 'csv' } })), 'Cleanup');
});

test('uncertain create, processing errors and unconfirmed deletion cannot navigate into a new import', () => {
  for (const phase of ['uncertain', 'deleting', 'delete_failed'] as const) {
    assert.equal(getImportRoute(snapshot({ ...operation, phase, job: job('ready') })), 'Processing');
  }
  for (const status of ['queued', 'processing', 'error'] as const) {
    assert.equal(getImportRoute(snapshot({ ...operation, job: job(status) })), 'Processing');
  }
  assert.equal(getImportRoute({ ...snapshot({ ...operation, phase: 'uncertain' }), fault: 'network' }), 'Processing');
  assert.equal(getImportRoute(snapshot({ ...operation, job: job('ready') })), 'Report');
});
