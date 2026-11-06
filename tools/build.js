// Builds the unpacked extension into dist/. Load dist/ in chrome://extensions.
//   node tools/build.js           one-off build
//   node tools/build.js --watch   rebuild on change

import * as esbuild from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

/** Static files copied verbatim: [source, destination] relative to root / dist. */
const STATIC = [
  ['manifest.json', 'manifest.json'],
  ['src/panel/index.html', 'panel/index.html'],
  ['src/panel/panel.css', 'panel/panel.css'],
  ['profiles', 'profiles'],
  ['icons', 'icons'],
];

async function copyStatic() {
  for (const [from, to] of STATIC) {
    const src = path.join(root, from);
    if (!existsSync(src)) continue;
    await cp(src, path.join(dist, to), { recursive: true });
  }
}

/** @type {import('esbuild').BuildOptions} */
const options = {
  absWorkingDir: root,
  entryPoints: {
    background: 'src/background/service-worker.js',
    'panel/panel': 'src/panel/panel.js',
  },
  outdir: dist,
  bundle: true,
  format: 'esm',
  target: 'chrome116',
  sourcemap: 'linked',
  logLevel: 'info',
  plugins: [
    {
      name: 'copy-static',
      setup(build) {
        build.onEnd(async (result) => {
          if (result.errors.length === 0) await copyStatic();
        });
      },
    },
  ],
};

// Injected scripts can't be ES modules, so the page agent is built as one self-contained file.
/** @type {import('esbuild').BuildOptions} */
const agentOptions = {
  absWorkingDir: root,
  entryPoints: { 'content/agent': 'src/content/agent.js' },
  outdir: dist,
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  logLevel: 'info',
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

if (watch) {
  const [ctx, agentCtx] = await Promise.all([esbuild.context(options), esbuild.context(agentOptions)]);
  await Promise.all([ctx.watch(), agentCtx.watch()]);
  console.log('[build] watching — reload the extension in chrome://extensions after changes');
} else {
  await Promise.all([esbuild.build(options), esbuild.build(agentOptions)]);
}
