import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerSettings } from '../src/native/settings';

function storage() {
  const values = new Map<string, string>();
  return { values, async getItem(key: string) { return values.get(key) ?? null; },
    async setItem(key: string, value: string) { values.set(key, value); } };
}

test('saved LAN address survives a new settings instance and leaves import journals untouched', async () => {
  const disk = storage();
  disk.values.set('synthetic-import-journal-v1', 'current operation on a different server');
  disk.values.set('synthetic-import-cancellations-v1', 'pending cancellations on their original servers');
  const before = [...disk.values];
  const first = createServerSettings(disk);
  assert.equal(await first.load(), null);
  assert.equal(await first.save('  http://192.168.1.25:8787/  '), 'http://192.168.1.25:8787');
  const restarted = createServerSettings(disk);
  assert.equal(await restarted.load(), 'http://192.168.1.25:8787');
  for (const [key, value] of before) assert.equal(disk.values.get(key), value);
  assert.equal(disk.values.size, before.length + 1);
});

test('invalid addresses and failed saves preserve the previously saved preference', async () => {
  const disk = storage(); const settings = createServerSettings(disk);
  await settings.save('http://192.168.1.25:8787');
  const before = [...disk.values];
  for (const invalid of ['https://example.com', 'http://192.168.1.25:8787/private', 'http://user:secret@192.168.1.25:8787']) {
    await assert.rejects(settings.save(invalid), { code: 'bad-url' });
    assert.deepEqual([...disk.values], before);
  }
  const failing = createServerSettings({ ...disk, async setItem() { throw new Error('disk full'); } });
  await assert.rejects(failing.save('http://192.168.1.50:8787'), { code: 'settings-save' });
  assert.equal(await createServerSettings(disk).load(), 'http://192.168.1.25:8787');
});

test('unreadable or corrupt settings fail explicitly instead of masquerading as a first launch', async () => {
  const disk = storage();
  for (const getItem of [async () => { throw new Error('unavailable'); }, async () => 'https://example.com', async () => '']) {
    await assert.rejects(createServerSettings({ ...disk, getItem }).load(), { code: 'settings-load' });
  }
});

test('saving does not report success before persistence completes', async () => {
  const disk = storage();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const settings = createServerSettings({ ...disk, async setItem(key, value) { await gate; await disk.setItem(key, value); } });
  let completed = false;
  const saving = settings.save('http://192.168.1.25:8787').then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false); assert.equal(await settings.load(), null);
  release(); await saving;
  assert.equal(await createServerSettings(disk).load(), 'http://192.168.1.25:8787');
});
