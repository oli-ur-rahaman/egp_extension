// @ts-nocheck: a live check script; it drives the panel and only counts what comes back.
/* global chrome */
// Reloads the extension in the debug Chrome (after `npm run build`) and opens its panel on the Flow 1 report tab, as a tab a script can drive.
//   node tools/recon/live-reload.js
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root = process.cwd();
const { chromium } = await import(pathToFileURL(path.join(root, 'node_modules/@playwright/test/index.mjs')).href);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222').catch(() => {
  console.error('No debug Chrome on port 9222. Run `npm run chrome`, log in to e-GP there, open Reports > Procurement Transaction Report, then run this again.');
  process.exit(1);
});
const context = browser.contexts()[0];
const sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
if (!sw) throw new Error('extension worker not found');
const id = new URL(sw.url()).host;
console.log('before', await sw.evaluate(() => chrome.runtime.getManifest().version));
await sw.evaluate(() => chrome.runtime.reload()).catch(() => {});
await new Promise((r) => setTimeout(r, 3000));
const sw2 = context.serviceWorkers().find((w) => w.url().startsWith(`chrome-extension://${id}`)) ?? (await context.waitForEvent('serviceworker', { timeout: 15000 }));
console.log('after', await sw2.evaluate(() => chrome.runtime.getManifest().version));
const report = context.pages().find((p) => p.url().includes('/report/ProcTransReport.jsp'));
await report.reload();
const tabId = await sw2.evaluate(async () => (await chrome.tabs.query({ url: '*://*.eprocure.gov.bd/report/*' }))[0]?.id);
for (const p of context.pages()) if (p.url().startsWith(`chrome-extension://${id}/panel`)) await p.close();
const panel = await context.newPage();
await panel.goto(`chrome-extension://${id}/panel/index.html?tab=${tabId}`);
await report.bringToFront();
await panel.waitForSelector('[data-filter]', { timeout: 20000 });
console.log('panel ready', await panel.locator('#version').textContent(), 'filters', await panel.locator('[data-filter]').count(), 'tab', tabId);
await browser.close().catch(() => {});
