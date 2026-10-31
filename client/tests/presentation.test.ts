import test from 'node:test';
import assert from 'node:assert/strict';
import type { Snapshot } from '../src/core/controller';
import { parseJob, type Journal, type LocalFile } from '../src/core/model';
import { getImportPresentation } from '../src/features/import/presentation';

const file: LocalFile = { stagedId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.bin', name: 'statement.csv', size: 112, format: 'csv' };
const operation: Journal = { version: 1, key: 'stable-test-key', baseUrl: 'http://127.0.0.1:8787', phase: 'active' };
const snapshot = (op: Journal | null, fault: string | null = null): Snapshot => ({ operation: op, fault, booting: false, busy: false, pendingCancellations: [], cancelling: false, checkingCancellations: false, cancellationFault: null });

test('server error presents manual recovery and deletion without a result or an endless spinner', () => {
  const job = parseJob({ jobId: 'job-demo-001', status: 'error', revision: 3 });
  const view = getImportPresentation(snapshot({ ...operation, job }));
  assert.equal(view.title, 'Ошибка обработки');
  assert.equal(view.working, true);
  assert.equal(view.spinning, false);
  assert.equal(view.ready, false);
  assert.equal(view.canPick, false);
  assert.equal(view.canDelete, true);
  assert.equal(view.retryUpload, false);
});

test('background cancellation failures stay quiet unless the queue blocks a new selection', () => {
  const pending = { key: 'old-create-key', baseUrl: operation.baseUrl, deleteKey: 'old-delete-key' };
  for (const cancellationFault of [null, 'cancel-not-found', 'wait-stopped', 'network', 'timeout', 'http-503', 'bad-response', 'storage']) {
    const view = getImportPresentation({ ...snapshot(null), pendingCancellations: [pending], cancellationFault });
    assert.equal(view.cancellationIssue, null);
    assert.equal(view.canPick, true);
    assert.equal(view.isDeleted, false);
  }
  const error = { ...snapshot(null), pendingCancellations: [pending], cancellationFault: 'network' };
  const retrying = getImportPresentation({ ...error, busy: true, checkingCancellations: true });
  assert.equal(retrying.cancellationIssue, null);
  assert.equal(retrying.busy, false);
  assert.equal(retrying.canPick, true);
  const full = getImportPresentation({ ...snapshot(null), pendingCancellations: Array.from({ length: 32 }, (_, i) => ({ ...pending, key: `old-key-${i}` })) });
  assert.ok(full.cancellationIssue);
  assert.equal(full.canPick, false);
});

test('a current deletion failure remains visible independently of old cancellations', () => {
  const job = parseJob({ jobId: 'job-demo-001', status: 'ready', revision: 3, currency: 'AUD', items: [] });
  const view = getImportPresentation(snapshot({ ...operation, phase: 'delete_failed', job, deleteKey: 'stable-delete-key' }, 'http-503'));
  assert.equal(view.title, 'Удаление не подтверждено');
  assert.equal(view.fault, 'http-503');
  assert.equal(view.canDelete, true);
  assert.equal(view.isDeleted, false);
  assert.equal(view.canPick, false);
});

test('deletion controls stay visible across busy and idle polls without offering another deletion', () => {
  const ready = parseJob({
    jobId: 'job-demo-001',
    status: 'ready',
    revision: 3,
    currency: 'AUD',
    items: [],
  });
  const deleting = parseJob({ jobId: ready.jobId, status: 'deleting', revision: 4 });
  const cases: Journal[] = [
    { ...operation, phase: 'deleting', job: ready, deleteKey: 'stable-delete-key' },
    { ...operation, phase: 'deleting', job: deleting, deleteKey: 'stable-delete-key' },
    { ...operation, phase: 'active', job: deleting, deleteKey: 'stable-delete-key' },
  ];
  for (const current of cases) {
    for (const busy of [false, true]) {
      for (const fault of [null, 'network']) {
        const view = getImportPresentation({ ...snapshot(current, fault), busy });
        assert.equal(view.showStopWaiting, true);
        assert.equal(view.canDelete, false);
        assert.equal(view.canCancelTransfer, false);
        assert.equal(view.canPick, false);
      }
    }
  }
  const failed = getImportPresentation(
    snapshot(
      { ...operation, phase: 'delete_failed', job: deleting, deleteKey: 'stable-delete-key' },
      'http-503',
    ),
  );
  assert.equal(failed.canDelete, true, 'A failed deletion must still allow an explicit retry');
  assert.equal(failed.showStopWaiting, true);
  const completed = getImportPresentation(
    snapshot({
      ...operation,
      phase: 'deleted',
      job: parseJob({ jobId: ready.jobId, status: 'deleted', revision: 5 }),
    }),
  );
  assert.equal(completed.showStopWaiting, false);
});

test('confirmed server deletion cannot enable a new import while private cleanup is incomplete', () => {
  const job = parseJob({ jobId: 'job-demo-001', status: 'deleted', revision: 5 });
  const pending = getImportPresentation(snapshot({ ...operation, phase: 'deleted', job, file }, 'cleanup'));
  assert.equal(pending.isDeleted, true);
  assert.equal(pending.canPick, false);
  assert.equal(pending.fault, 'cleanup');
  const completed = getImportPresentation(snapshot({ ...operation, phase: 'deleted', job }));
  assert.equal(completed.canPick, true);
  assert.equal(completed.canDelete, false);
});

test('unknown POST outcome offers explicit recovery but cannot start an unrelated import', () => {
  const view = getImportPresentation(snapshot({ ...operation, phase: 'uncertain', file }, 'network'));
  assert.equal(view.title, 'Проверяем отправку');
  assert.equal(view.retryUpload, true);
  assert.equal(view.canPick, false);
  assert.equal(view.ready, false);
  assert.equal(view.canDelete, false);
});

test('lost pre-upload file offers reselection; uncertain POST keeps server recovery instead', () => {
  const selected = getImportPresentation(snapshot({ ...operation, phase: 'selected', file }, 'file-missing'));
  assert.equal(selected.selectionUnavailable, true);
  assert.equal(selected.fault, 'selection-file-missing');
  assert.equal(selected.retryUpload, false);
  const uncertain = getImportPresentation(snapshot({ ...operation, phase: 'uncertain', file }, 'file-missing'));
  assert.equal(uncertain.selectionUnavailable, false);
  assert.equal(uncertain.fault, 'file-missing');
  assert.equal(uncertain.canPick, false);
  const cleanup = getImportPresentation(snapshot({ ...operation, phase: 'selected', file }, 'cleanup'));
  assert.equal(cleanup.selectionCleanupFailed, true);
});
