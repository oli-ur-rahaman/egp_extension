// @ts-nocheck: a live check script; it drives the panel and only counts what comes back.
/* global chrome */
// One long live run (about an hour): Flow 4, PWD, all offices, every detail field, at the tool's own pace.
// Picks a sign-date window that measures 600 to 1,100 rows, runs it, and logs progress every 30 s. Counts only.
//   node tools/recon/live-long.js        (debug Chrome open; logged in or not)
// Log the result in docs/recon/self-run-log.md.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
const root = process.cwd();
const { chromium } = await import(pathToFileURL(path.join(root, 'node_modules/@playwright/test/index.mjs')).href);
const XLSX = await import(pathToFileURL(path.join(root, 'vendor/xlsx.js')).href);
const profile = JSON.parse(readFileSync(path.join(root, 'profiles/eprocure.gov.bd.json'), 'utf8'));
const flow = profile.flows.contract_info;
const OUT = process.env.OUT ?? path.join(root, 'recon', 'raw', `live-long-${Date.now()}.txt`);
mkdirSync(path.dirname(OUT), { recursive: true });
const log = (line) => {
  const text = `${new Date().toISOString().slice(11, 19)} ${line}`;
  appendFileSync(OUT, `${text}\n`);
  console.log(text);
};

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222').catch(() => {
  console.error('No debug Chrome on port 9222. Run `npm run chrome`, then run this again.');
  process.exit(1);
});
const context = browser.contexts()[0];
const prefs = JSON.parse(readFileSync(path.join(root, '.chrome-debug-profile', 'Default', 'Secure Preferences'), 'utf8'));
const id = Object.entries(prefs.extensions?.settings ?? {}).find(([, v]) => (v.path ?? '').toLowerCase() === path.join(root, 'dist').toLowerCase())?.[0];
const stamp = /"(\d{4}-\d{2}-\d{2}T[\d:.]+Z)"/.exec(readFileSync(path.join(root, 'dist', 'background.js'), 'utf8'))?.[1];
const ping = async () => {
  const p = await context.newPage();
  await p.goto(`chrome-extension://${id}/panel/index.html`).catch(() => {});
  const reply = await p.evaluate(() => chrome.runtime.sendMessage({ type: 'sw/ping' })).catch(() => null);
  return { p, buildId: reply?.buildId };
};
let { p: opener, buildId } = await ping();
if (buildId !== stamp) {
  log('the running extension is not the build on disk: reloading it');
  await opener.evaluate(() => chrome.runtime.reload()).catch(() => {});
  await new Promise((r) => setTimeout(r, 4000));
  ({ p: opener, buildId } = await ping());
  if (buildId !== stamp) throw new Error('Still not the build on disk: press the reload arrow in chrome://extensions.');
}
await opener.close().catch(() => {});

const page = await context.newPage();
await page.goto(profile.site.baseUrl + flow.page.url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const sw = context.serviceWorkers().find((w) => w.url().includes(id));
const tabId = await sw.evaluate(async (url) => (await chrome.tabs.query({})).find((t) => t.url?.includes(url))?.id, flow.page.url);
const panel = await context.newPage();
panel.setDefaultTimeout(60000);
await panel.goto(`chrome-extension://${id}/panel/index.html?tab=${tabId}`);
await page.bringToFront();
await panel.locator('[data-filter]').first().waitFor();
log(`panel: ${(await panel.locator('#flow-head').innerText()).replace(/\s+/g, ' ')}`);
await panel.locator('#f-department-open').click();
await panel.locator('.tree li', { hasText: /Housing (and|&) Public Works/ }).first().locator('.twist').first().click();
await panel.locator('.tree .node', { hasText: /^\s*Public Works Department/ }).first().click();
await panel.locator('[data-count="procuring_entity"]').filter({ hasText: /\d{2,} items/ }).waitFor();

const setWindow = async (from, to) => {
  await panel.locator('#f-sign_date-from').fill(from);
  await panel.locator('#f-sign_date-from').blur();
  await panel.locator('#f-sign_date-to').fill(to);
  await panel.locator('#f-sign_date-to').blur();
  await panel.waitForTimeout(800);
};
const measure = async () => {
  await panel.locator('#start').click();
  await panel.locator('#plan-count').waitFor({ timeout: 120000 });
  return Number((await panel.locator('#plan-count').textContent()).replace(/\D/g, ''));
};
// Windows to try, smallest first, until one is the right size.
const windows = [['01/10/2025', '15/10/2025'], ['01/10/2025', '31/10/2025'], ['01/09/2025', '31/10/2025'], ['01/07/2025', '31/10/2025']];
let chosen = null;
for (const [from, to] of windows) {
  await setWindow(from, to);
  const rows = await measure();
  log(`window ${from} to ${to}: ${rows} rows`);
  if (rows >= 600 && rows <= 1100) {
    chosen = { from, to, rows };
    break;
  }
  if (rows > 1100) {
    chosen = { from, to, rows };
    log('over 1,100: running it anyway as the nearest');
    break;
  }
  await panel.locator('#plan-close').click();
  await panel.waitForTimeout(3500); // polite between measurements
}
if (!chosen) throw new Error('no window reached 600 rows');
for (const box of await panel.locator('input[data-cluster]').all()) await box.check();
log(`estimate: ${(await panel.locator('#plan-estimate').innerText()).replace(/\s+/g, ' ')}`);
if (await panel.locator('#plan-agree-line').isVisible()) await panel.locator('#plan-agree').check();
await panel.locator('#run-start').click();
const t0 = Date.now();
log(`started: ${chosen.rows} rows, sign dates ${chosen.from} to ${chosen.to}`);

const runNow = () => panel.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('pdms-runs'); r.onsuccess = () => res(r.result); });
  const q = db.transaction('runs').objectStore('runs').getAll();
  const run = await new Promise((res) => { q.onsuccess = () => res(q.result.sort((a, b) => b.startedAt - a.startedAt)[0]); });
  return { status: run.status, phase: run.phase, page: run.page, totalPages: run.totalPages, sweep: run.sweep, rows: run.stats.rows, expected: run.expected,
    detail: run.stats.detailDone, failed: run.stats.detailFailed, refused: run.stats.refused, requests: run.requests, attempts: run.attempts,
    interruptions: run.interruptions.map((i) => i.kind), reason: run.reason, note: run.note, pauseKind: run.pauseKind };
});
let last = '';
for (;;) {
  await new Promise((r) => setTimeout(r, 30000));
  const s = await runNow();
  const line = `${Math.round((Date.now() - t0) / 60000)} min | ${s.status} ${s.phase} | list ${s.page}/${s.totalPages} sweep ${s.sweep} | rows ${s.rows}/${s.expected} | detail ${s.detail} failed ${s.failed} refused ${s.refused} | requests ${s.requests} | retries now ${s.attempts}${s.reason ? ` | ${s.reason}` : ''}${s.note ? ` | ${s.note}` : ''}`;
  if (line !== last) log(line);
  last = line;
  if (s.status !== 'running') break;
}
const end = await runNow();
log(`ended: ${JSON.stringify(end)}`);
const swNow = context.serviceWorkers().find((w) => w.url().includes(id));
const before = await swNow.evaluate(async () => (await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 }))[0]?.id ?? null);
await panel.locator('#run-download').click();
let item;
for (let i = 0; i < 60; i++) {
  item = await swNow.evaluate(async () => (await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 }))[0]);
  if (item && item.id !== before && item.state === 'complete') break;
  await new Promise((r) => setTimeout(r, 500));
}
const book = XLSX.read(readFileSync(item.filename), { type: 'buffer' });
const data = XLSX.utils.sheet_to_json(book.Sheets.Data, { raw: true });
const about = XLSX.utils.sheet_to_json(book.Sheets['About this grab'], { header: 1 });
const outcome = {};
for (const r of data) outcome[r['Detail page']] = (outcome[r['Detail page']] ?? 0) + 1;
log(`file: ${data.length} rows, ${new Set(data.map((r) => r['Contract ID'] ?? r['Tender/Proposal ID'])).size} distinct contracts, detail ${JSON.stringify(outcome)}, verdict ${about.find((r) => r[0] === 'Verdict')?.[1]}, took ${about.find((r) => r[0] === 'Time taken')?.[1]}`);
log(`minutes ${Math.round((Date.now() - t0) / 60000)}, about ${((Date.now() - t0) / 1000 / Math.max(1, end.requests)).toFixed(1)} s per request`);
await browser.close().catch(() => {});
