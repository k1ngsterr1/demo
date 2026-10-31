import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Compose the installed, MIT-licensed Phosphor Receipt glyph; never trace a reference design.
const root = fileURLToPath(new URL('../client/', import.meta.url));
const require = createRequire(root + 'package.json');
const sharp = require('sharp');
const definition = await readFile(root + 'node_modules/phosphor-react-native/src/defs/Receipt.tsx', 'utf8');
const path = definition.split("'regular'")[1]?.match(/<Path d="([^"]+)"/)?.[1];
if (!path) throw new Error('Phosphor Receipt regular glyph not found');
const glyph = `<g transform="translate(256 256) scale(2)" fill="#182820"><path d="${path}"/></g>`;
const assets = {
  'splash-mark': `<rect x="32" y="32" width="960" height="960" rx="280" fill="#CBF28B"/>${glyph}`,
  'app-icon': `<rect width="1024" height="1024" fill="#CBF28B"/>${glyph}`,
  'adaptive-icon': glyph,
};
for (const [name, body] of Object.entries(assets)) {
  const src = root + `assets/${name}.svg`;
  await writeFile(src, `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>\n`);
  await sharp(src).png().toFile(root + `assets/${name}.png`);
}
await writeFile(root + 'assets/PHOSPHOR-LICENSE.txt', await readFile(root + 'node_modules/phosphor-react-native/LICENSE'));
