import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const [device, scenario] = process.argv.slice(2);
if (!device || !['relocated', 'missing'].includes(scenario)) throw new Error('Usage: seed-ios-recovery.mjs <dedicated QA simulator UUID> relocated|missing');
const devices = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', '-j'], { encoding: 'utf8' }));
const target = Object.values(devices.devices).flat().find(value => value.udid === device);
if (!target?.name.startsWith('Statement File Recovery QA') || target.state !== 'Booted') throw new Error('Only the dedicated booted Statement File Recovery QA simulator is allowed');
const bundle = 'dev.synthetic.statementimport';
try { execFileSync('xcrun', ['simctl', 'terminate', device, bundle], { stdio: 'ignore' }); } catch { /* The app may not be running. */ }
const container = execFileSync('xcrun', ['simctl', 'get_app_container', device, bundle, 'data'], { encoding: 'utf8' }).trim();
const storage = resolve(container, 'Library/Application Support', bundle, 'RCTAsyncLocalStorage_V1');
const staging = resolve(container, 'Library/Caches/statement-import');
await mkdir(storage, { recursive: true });
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
const stagedId = `${randomUUID()}.bin`;
const fixture = resolve(dirname(fileURLToPath(import.meta.url)), '../kit/fixtures/statement.csv');
const bytes = await readFile(fixture);
if (scenario === 'relocated') await copyFile(fixture, resolve(staging, stagedId));
const journal = { version: 1, key: `recovery-${randomUUID()}`, baseUrl: 'http://127.0.0.1:8787', phase: 'selected',
  file: { uri: `file:///var/mobile/Containers/Data/Application/00000000-0000-4000-8000-000000000001/Library/Caches/statement-import/${stagedId}`,
    name: 'statement.csv', size: bytes.length, format: 'csv' } };
const manifestPath = resolve(storage, 'manifest.json');
let manifest = {};
try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
manifest['synthetic-import-journal-v1'] = JSON.stringify(journal);
await writeFile(manifestPath, JSON.stringify(manifest));
process.stdout.write(`Prepared synthetic ${scenario} cache scenario; no external file access.\n`);
