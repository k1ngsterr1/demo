import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJob, parseJournal } from '../src/core/model';

const file = { stagedId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.bin', name: 'synthetic.csv', size: 112, format: 'csv' };
const journal = { version: 1, key: 'original-create-key', baseUrl: 'http://127.0.0.1:8787', phase: 'selected', file };
const item = { id: 'monthly-payment', merchant: 'Synthetic service', amountMinor: 1299, cadence: 'monthly', lastSeen: '2026-10-15' };

test('job status requires a primitive string even if coercion would match an allowed value', () => {
  for (const status of ['queued', 'processing', 'ready', 'error', 'deleting', 'deleted']) {
    for (const invalid of [[status], { toString: () => status }, new String(status), null, 1]) {
      assert.throws(() => parseJob({ jobId: 'job', revision: 1, status: invalid }), { code: 'bad-response' });
    }
  }
});

test('persisted phase, file format and nested job status reject arrays without bypassing invariants', () => {
  for (const phase of ['selected', 'uncertain', 'active', 'deleting', 'delete_failed', 'deleted']) {
    assert.throws(() => parseJournal(JSON.stringify({ ...journal, phase: [phase] })), { code: 'storage-corrupt' });
  }
  assert.throws(() => parseJournal(JSON.stringify({ ...journal, phase: ['selected'], file: undefined })), { code: 'storage-corrupt' });
  for (const format of [['pdf'], ['csv'], null, 1, {}]) {
    assert.throws(() => parseJournal(JSON.stringify({ ...journal, file: { ...file, format } })), { code: 'storage-corrupt' });
  }
  assert.throws(() => parseJournal(JSON.stringify({ ...journal, phase: 'active', job: { jobId: 'job', revision: 1, status: ['queued'] } })), { code: 'storage-corrupt' });
  assert.equal(parseJournal(JSON.stringify(journal)).file?.format, 'csv');
});

test('report parser projects allowlisted fields and does not retain source item objects', () => {
  const sourceItem = { ...item, documentText: 'sensitive synthetic payload', account: { token: 'extra secret' } };
  const source = { jobId: 'job', revision: 3, status: 'ready', currency: 'AUD', items: [sourceItem], rawDocument: 'extra document' };
  const expected = { jobId: 'job', revision: 3, status: 'ready', currency: 'AUD', items: [item] };
  const job = parseJob(source);
  assert.deepEqual(job, expected);
  assert.notEqual(job.items![0], sourceItem);
  assert.deepEqual(parseJournal(JSON.stringify({ ...journal, phase: 'active', job: source })).job, expected);
  sourceItem.merchant = 'changed after parsing';
  assert.equal(job.items![0]!.merchant, item.merchant);
});
