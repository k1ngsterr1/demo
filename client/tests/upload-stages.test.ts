import assert from 'node:assert/strict';
import test from 'node:test';
import { parseJob, type Journal } from '../src/core/model';
import {
  getUploadProgressStage,
  getUploadSteps,
  getUploadTransitionKey,
} from '../src/features/import/uploadStages';

const operation: Journal = {
  version: 1,
  key: 'visual-stage-test-key',
  baseUrl: 'http://127.0.0.1:8787',
  phase: 'active',
};

test('poll revisions do not replay entry motion; status and recovery changes do', () => {
  const job = parseJob({ jobId: 'job-demo-001', status: 'processing', revision: 2 });
  const active = { ...operation, job };
  const key = getUploadTransitionKey(active, false, null);
  assert.equal(
    getUploadTransitionKey({ ...active, job: { ...job, revision: 3 } }, false, null),
    key,
  );
  assert.notEqual(getUploadTransitionKey(active, false, 'network'), key);
  assert.notEqual(
    getUploadTransitionKey({ ...active, job: { ...job, status: 'queued' } }, false, null),
    key,
  );
});

test('an uncertain POST never marks the file as received or the report as ready', () => {
  const stage = getUploadProgressStage({ ...operation, phase: 'uncertain' });
  assert.equal(stage, 'sending');
  assert.deepEqual(
    getUploadSteps('sending')?.map(step => step.state),
    ['current', 'pending', 'pending'],
  );
});

test('queue, processing and server error have distinct visuals without inventing report progress', () => {
  for (const status of ['queued', 'processing', 'error'] as const) {
    const job = parseJob({ jobId: 'job-demo-001', status, revision: status === 'queued' ? 1 : 2 });
    assert.equal(getUploadProgressStage({ ...operation, job }), status);
    const steps = getUploadSteps(status);
    assert.equal(steps?.[0]?.state, 'complete');
    assert.equal(steps?.[1]?.state, status === 'error' ? 'error' : 'current');
    assert.equal(steps?.[2]?.state, 'pending');
  }
});

test('deletion and failed deletion cannot show the import success timeline', () => {
  const ready = parseJob({
    jobId: 'job-demo-001',
    status: 'ready',
    revision: 3,
    currency: 'AUD',
    items: [],
  });
  assert.equal(getUploadProgressStage({ ...operation, job: ready, phase: 'deleting' }), 'deleting');
  assert.equal(
    getUploadProgressStage({ ...operation, job: ready, phase: 'delete_failed' }),
    'delete-error',
  );
  assert.equal(getUploadSteps('deleting'), null);
  assert.equal(getUploadSteps('delete-error'), null);
});

test('settled and unselected operations do not briefly mount a processing loader', () => {
  assert.equal(getUploadProgressStage(null), null);
  assert.equal(getUploadProgressStage({ ...operation, phase: 'selected' }), null);
  assert.equal(getUploadProgressStage({ ...operation, phase: 'deleted' }), null);
  const ready = parseJob({
    jobId: 'job-demo-001',
    status: 'ready',
    revision: 3,
    currency: 'AUD',
    items: [],
  });
  assert.equal(getUploadProgressStage({ ...operation, job: ready }), null);
});
