// D73: files are saved under the tool's own name, even when another extension hooks Chrome's naming of downloads
// (download managers do; the owner's Chrome has three). Run `npm run build` first.
// Chrome's own naming is used here, not Playwright's, which saves every download under a random ID.
import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const dist = path.join(root, 'dist');
const hook = path.join(root, 'tests', 'fixtures', 'rename-hook-extension');

// Chrome lets the extension installed last decide a download's name, so both orders are tried.
for (const order of ['installed before PDMS', 'installed after PDMS']) test(`the office hierarchy export keeps its name with a download manager ${order}`, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'egp-name-'));
  const saved = path.join(dir, 'downloads');
  await mkdir(path.join(dir, 'profile', 'Default'), { recursive: true });
  await mkdir(saved);
  await writeFile(path.join(dir, 'profile', 'Default', 'Preferences'), JSON.stringify({ download: { default_directory: saved, prompt_for_download: false } }));
  const both = order === 'installed after PDMS' ? `${dist},${hook}` : `${hook},${dist}`;
  const context = await chromium.launchPersistentContext(path.join(dir, 'profile'), { channel: 'chromium', args: [`--disable-extensions-except=${both}`, `--load-extension=${both}`] });
  try {
    await context.route(/^https?:\/\//, (route) => route.abort());
    let worker = context.serviceWorkers().find((w) => w.url().endsWith('/background.js'));
    while (!worker) worker = (await context.waitForEvent('serviceworker')).url().endsWith('/background.js') ? context.serviceWorkers().find((w) => w.url().endsWith('/background.js')) : undefined;
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/panel/index.html`);
    const cdp = await context.newCDPSession(panel);
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'default' });
    await panel.locator('#settings').click();
    await panel.locator('#editor-export').click();
    await expect.poll(() => readdir(saved), { timeout: 15000 }).toEqual(['PDMS_office_hierarchy.xls']);
  } finally {
    await context.close();
    await rm(dir, { recursive: true, force: true });
  }
});
