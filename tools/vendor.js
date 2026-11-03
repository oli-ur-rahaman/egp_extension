// Refreshes vendor/ from node_modules: one self-contained ESM file per library,
// plus vendor/SHA256SUMS. Source code imports from vendor/, never from a CDN.
// Run after changing a library version: npm run vendor

import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = path.join(root, 'vendor');

/** [output file, package entry, package name] */
const LIBS = [
  ['idb.js', 'idb', 'idb'],
  ['xlsx.js', 'xlsx/xlsx.mjs', 'xlsx'],
];

await mkdir(vendorDir, { recursive: true });

const sums = [];
for (const [file, entry, pkg] of LIBS) {
  const { version } = JSON.parse(await readFile(path.join(root, 'node_modules', pkg, 'package.json'), 'utf8'));
  const out = path.join(vendorDir, file);
  await esbuild.build({
    absWorkingDir: root,
    stdin: { contents: `export * from '${entry}';`, resolveDir: root },
    outfile: out,
    bundle: true,
    format: 'esm',
    target: 'chrome116',
    banner: { js: `// vendored ${pkg}@${version} — regenerate with: npm run vendor` },
    logLevel: 'warning',
  });
  const hash = createHash('sha256').update(await readFile(out)).digest('hex');
  sums.push(`${hash}  ${file}`);
  console.log(`[vendor] ${pkg}@${version} -> vendor/${file}`);
}

await writeFile(path.join(vendorDir, 'SHA256SUMS'), sums.join('\n') + '\n');
