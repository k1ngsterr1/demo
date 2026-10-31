// Adapt Expo's two-argument config merge to the maintained Fastify engine.
// The npm alias replaces the old library; no vulnerable deepmerge source remains.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const configVersion = '55.0.21';
const originalHash = 'a0d567ab03902c257e04fef0533d8279c61196e7ed7cdb2ed5227d4e39b81cb8';
const before = 'const data = _interopRequireDefault(require("deepmerge"));';
const after = 'const data = _interopRequireDefault(require("deepmerge")({ symbols: true }));';

export function patchedExpoConfigSource(source) {
  // Accept our exact previous edit only when undoing it recovers reviewed source.
  // An Expo update or an unrelated node_modules edit must fail for manual review.
  const original = source.replace(after, before);
  const hash = createHash('sha256').update(original).digest('hex');
  if (hash !== originalHash) {
    throw new Error('Unrecognized @expo/config source; review the merge-engine adaptation');
  }
  return original.replace(before, after);
}

export function patchToolchain() {
  const configPackage = require.resolve('@expo/config/package.json');
  const configRequire = createRequire(configPackage);
  const config = JSON.parse(readFileSync(configPackage, 'utf8'));
  const engine = configRequire('deepmerge/package.json');
  if (config.version !== configVersion) {
    throw new Error('Review the merge-engine adaptation before upgrading @expo/config');
  }
  if (engine.name !== '@fastify/deepmerge' || engine.version !== '3.2.4') {
    throw new Error('Expo config requires the reviewed @fastify/deepmerge replacement');
  }
  const path = join(dirname(configPackage), 'build/Config.js');
  const source = readFileSync(path, 'utf8');
  const patched = patchedExpoConfigSource(source);
  if (source !== patched) writeFileSync(path, patched);
  console.log('@expo/config 55.0.21: verified @fastify/deepmerge 3.2.4 adaptation');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) patchToolchain();
