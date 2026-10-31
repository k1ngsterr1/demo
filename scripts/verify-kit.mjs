import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(await readFile(new URL('../docs/kit-sha256.json', import.meta.url), 'utf8'));
for (const [name, expected] of Object.entries(manifest)) {
  const bytes = await readFile(new URL(`../kit/${name}`, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`Kit integrity mismatch: ${name}`);
}
console.log(`Verified ${Object.keys(manifest).length} original kit files (SHA-256).`);
