import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const device = process.argv[2];
if (!device || !/^[0-9a-f-]{36}$/i.test(device)) throw new Error('Pass the UUID of a dedicated synthetic QA simulator.');
const groups = execFileSync('xcrun', ['simctl', 'get_app_container', device, 'com.apple.DocumentsApp', 'groups'], { encoding: 'utf8' });
const group = groups.split('\n').find(line => line.startsWith('group.com.apple.FileProvider.LocalStorage\t'))?.split('\t')[1];
if (!group) throw new Error('Local Files provider is unavailable on this simulator.');
const target = join(group.trim(), 'File Provider Storage', 'Statement QA');
await mkdir(target, { recursive: true });
for (const name of ['statement.csv', 'statement.pdf', 'spoofed.pdf', 'oversize.csv']) {
  const source = fileURLToPath(new URL(`../kit/fixtures/${name}`, import.meta.url));
  try { await copyFile(source, join(target, name), constants.COPYFILE_EXCL); }
  catch (error) {
    if (error.code !== 'EEXIST' || !(await readFile(source)).equals(await readFile(join(target, name)))) throw error;
  }
}
console.log('Four synthetic fixtures prepared in the dedicated simulator Files provider.');
