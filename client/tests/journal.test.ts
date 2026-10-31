import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJournal } from '../src/core/model';
import { migrateStoredJournal } from '../src/native/journal';

const stagedId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.bin';
const container = '11111111-1111-4111-8111-111111111111';
const legacyUri = `file:///var/mobile/Containers/Data/Application/${container}/Library/Caches/statement-import/${stagedId}`;
const base = { version: 1, key: 'same-create-key', baseUrl: 'http://127.0.0.1:8787', phase: 'selected' };
const file = { name: 'statement.csv', size: 112, format: 'csv' };

test('legacy sandbox path migrates to a portable ID before sweep without changing durable intent', () => {
  for (const phase of ['selected', 'uncertain', 'active', 'deleting', 'delete_failed', 'deleted']) {
    const job = ['selected', 'uncertain'].includes(phase) ? undefined : { jobId: 'job-demo-001', revision: 5, status: phase === 'deleted' ? 'deleted' : 'queued' };
    const original = { ...base, phase, file: { ...file, uri: legacyUri }, job, deleteKey: 'same-delete-key' };
    const { journal, migrated } = migrateStoredJournal(JSON.stringify(original));
    assert.equal(migrated, true);
    assert.deepEqual(journal.file, { ...file, stagedId });
    assert.equal(journal.phase, phase);
    assert.equal(journal.key, original.key);
    assert.equal(journal.deleteKey, original.deleteKey);
    assert.equal(journal.baseUrl, original.baseUrl);
    assert.deepEqual(journal.job, job);
    assert.equal(JSON.stringify(journal).includes(container), false);
  }
});

test('known iOS simulator and Android cache references migrate, and canonical records need no rewrite', () => {
  const paths = [legacyUri.replace('file:///var/', 'file:///private/var/'),
    `file:///Users/test/Library/Developer/CoreSimulator/Devices/${container}/data/Containers/Data/Application/${container}/Library/Caches/statement-import/${stagedId}`,
    `file:///data/user/0/dev.synthetic.statementimport/cache/statement-import/${stagedId}`,
    `file:///data/data/dev.synthetic.statementimport/cache/statement-import/${stagedId}`];
  for (const uri of paths) assert.equal(migrateStoredJournal(JSON.stringify({ ...base, file: { ...file, uri } })).journal.file?.stagedId, stagedId);
  const canonical = { ...base, file: { ...file, stagedId } };
  const result = migrateStoredJournal(JSON.stringify(canonical));
  assert.equal(result.migrated, false);
  assert.equal(result.journal.file?.stagedId, stagedId);
});

test('migration rejects external paths, traversal, encoded separators and non-generated filenames', () => {
  const invalid = [legacyUri.replace('/Library/Caches/', '/Documents/'), legacyUri.replace('file:///', 'https://example.com/'),
    legacyUri + '?query=1', legacyUri + '#fragment', legacyUri.replace(stagedId, '../' + stagedId),
    legacyUri.replace(stagedId, '%2e%2e%2f' + stagedId), legacyUri.replace(stagedId, 'statement.pdf'),
    legacyUri.replace(stagedId, stagedId + '/nested'), legacyUri.replace(stagedId, '%61' + stagedId.slice(1))];
  for (const uri of invalid) assert.throws(() => migrateStoredJournal(JSON.stringify({ ...base, file: { ...file, uri } })), { code: 'storage-corrupt' });
});

test('canonical journal rejects path-like IDs and strips legacy path metadata', () => {
  for (const id of ['../' + stagedId, legacyUri, stagedId + '/nested', 'missing.bin', '%2f' + stagedId]) {
    assert.throws(() => parseJournal(JSON.stringify({ ...base, file: { ...file, stagedId: id } })), { code: 'storage-corrupt' });
  }
  const result = migrateStoredJournal(JSON.stringify({ ...base, file: { ...file, stagedId, uri: legacyUri } }));
  assert.equal(result.migrated, true);
  assert.equal('uri' in result.journal.file!, false);
});
