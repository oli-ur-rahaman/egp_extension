// @ts-nocheck: a live check script; it drives the panel and only counts what comes back.
/* global chrome */
// Live check of Flow 2 logged in, through the panel in the debug Chrome. Uses the eTenders tab the owner opened after logging in:
// opening a portal page in a new tab while logged in can end the session (insight 64). Prints counts only.
//   node tools/recon/live-flow2-in.js
// OFFICE (default 1552), FROM and TO (default 01/09/2026 to 10/11/2026) can be set as environment variables.
// Log each run in docs/recon/self-run-log.md.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const root = process.cwd();
const { chromium } = await import(pathToFileURL(path.join(root, 'node_modules/@playwright/test/index.mjs')).href);
const XLSX = await import(pathToFileURL(path.join(root, 'vendor/xlsx.js')).href);
const profile = JSON.parse(readFileSync(path.join(root, 'profiles/eprocure.gov.bd.json'), 'utf8'));
const flow = profile.flows.tender_info;
const OFFICE = process.env.OFFICE ?? '1552';
const FROM = process.env.FROM ?? '01/09/2026';
const TO = process.env.TO ?? '10/11/2026';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222').catch(() => {
  console.error('No debug Chrome on port 9222. Run `npm run chrome`, log in there, open the eTenders advanced search, then run this again.');
  process.exit(1);
});
const context = browser.contexts()[0];
const page = context.pages().find((p) => p.url().includes(flow.page.url.split('?')[0]));
if (!page) throw new Error('No eTenders advanced search tab open: open it from the menu after logging in.');
const loggedIn = () => page.evaluate(async (states) => {
  // The portal's answer, not what the page shows: a page can keep Logout after the session ends (insight 64).
  const r = await fetch(states.sessionCheckUrl, { credentials: 'same-origin' });
  const d = new DOMParser().parseFromString(await r.text(), 'text/html');
  return !r.url.includes(states.sessionEnded.urlContains) && !!d.querySelector(states.logoutLink) && !d.querySelector(states.loginForm);
}, profile.pageStates);
console.log('logged in before:', await loggedIn());

const prefs = JSON.parse(readFileSync(path.join(root, '.chrome-debug-profile', 'Default', 'Secure Preferences'), 'utf8'));
const id = Object.entries(prefs.extensions?.settings ?? {}).find(([, v]) => (v.path ?? '').toLowerCase() === path.join(root, 'dist').toLowerCase())?.[0];
const opener = await context.newPage();
await opener.goto(`chrome-extension://${id}/panel/index.html`);
const tabId = await opener.evaluate(async (url) => (await chrome.tabs.query({})).find((t) => t.url?.includes(url))?.id, flow.page.url.split('?')[0]);
const stamp = /"(\d{4}-\d{2}-\d{2}T[\d:.]+Z)"/.exec(readFileSync(path.join(root, 'dist', 'background.js'), 'utf8'))?.[1];
let running = (await opener.evaluate(() => chrome.runtime.sendMessage({ type: 'sw/ping' })))?.buildId;
if (running !== stamp) {
  // Reloading the extension leaves the e-GP login alone.
  console.log('the running extension is not the build on disk: reloading it');
  await opener.evaluate(() => chrome.runtime.reload()).catch(() => {});
  await new Promise((r) => setTimeout(r, 4000));
  const again = await context.newPage();
  await again.goto(`chrome-extension://${id}/panel/index.html`).catch(() => {});
  running = (await again.evaluate(() => chrome.runtime.sendMessage({ type: 'sw/ping' })).catch(() => null))?.buildId;
  await again.close();
}
await opener.close().catch(() => {});
if (running !== stamp) throw new Error('The running extension is not the build on disk: press its reload arrow in chrome://extensions, then run this again.');

let step = 'opening the panel';
try {
  const panel = await context.newPage();
  panel.setDefaultTimeout(30000);
  await panel.goto(`chrome-extension://${id}/panel/index.html?tab=${tabId}`);
  await page.bringToFront();
  await panel.locator('[data-filter]').first().waitFor();
  const head = (await panel.locator('#flow-head').innerText()).replace(/\s+/g, ' ');
  const warned = await panel.locator('#start-warning').count();
  console.log(`panel: ${head} | logged-out warning shown: ${warned > 0}`);
  step = 'office';
  const officeName = await page.evaluate((v) => [...document.getElementById('cmbOffice').options].find((o) => o.value.trim() === v)?.text.trim(), OFFICE);
  if (!officeName) throw new Error(`office ${OFFICE} isn't in this account's office list`);
  await panel.locator('#f-procuring_entity').click();
  await panel.locator('#offices-search').fill(officeName);
  await panel.locator(`input[data-office="${OFFICE}"]`).first().check();
  await panel.locator('#offices-done').click();
  step = 'dates';
  for (const end of ['from', 'to']) {
    const tick = panel.locator(`#f-publishing_date-${end}-today`);
    if (await tick.isChecked()) await tick.uncheck();
    await panel.locator(`#f-publishing_date-${end}`).fill(end === 'from' ? FROM : TO);
    await panel.locator(`#f-publishing_date-${end}`).blur();
  }
  await panel.waitForTimeout(800);
  if (await panel.locator('#start-reasons').count()) throw new Error(`Start is held: ${await panel.locator('#start-reasons').innerText()}`);
  step = 'Start';
  await panel.locator('#start').click();
  await panel.locator('#plan-count').waitFor({ timeout: 90000 });
  const plan = await panel.locator('#plan-count').textContent();
  for (const box of await panel.locator('input[data-cluster]').all()) await box.check();
  step = `Start collecting (plan ${plan})`;
  await panel.locator('#run-start').click();
  const t0 = Date.now();
  await panel.locator('#run-state').filter({ hasText: /Finished|Paused|Stopped/ }).waitFor({ timeout: 30 * 60000 });
  const state = (await panel.locator('#run-view').innerText()).replace(/\s+/g, ' ').slice(0, 200);
  step = 'download';
  const sw = context.serviceWorkers().find((w) => w.url().includes(id));
  const last = await sw.evaluate(async () => (await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 }))[0]?.id ?? null);
  await panel.locator('#run-download').click();
  let item;
  for (let i = 0; i < 40; i++) {
    item = await sw.evaluate(async () => (await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 }))[0]);
    if (item && item.id !== last && item.state === 'complete') break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const book = XLSX.read(readFileSync(item.filename), { type: 'buffer' });
  const data = XLSX.utils.sheet_to_json(book.Sheets.Data, { raw: true });
  const methods = {};
  for (const r of data) methods[r['Procurement Method']] = (methods[r['Procurement Method']] ?? 0) + 1;
  const about = XLSX.utils.sheet_to_json(book.Sheets['About this grab'], { header: 1 });
  const verdict = about.find((r) => r[0] === 'Verdict')?.[1];
  const login = about.find((r) => r[0] === 'Login state')?.[1];
  console.log(`Flow 2 logged in: plan ${plan} | file ${data.length} rows, ${new Set(data.map((r) => r['Tender/Proposal ID'])).size} distinct IDs, detail read ${data.filter((r) => r['Detail page'] === 'Read').length}, refused ${data.filter((r) => r['Detail page'] === 'Refused by portal').length} | methods ${JSON.stringify(methods)} | login state in file: ${login} | verdict ${verdict} | ${Math.round((Date.now() - t0) / 1000)} s`);
  console.log(`panel: ${state}`);
} catch (err) {
  console.log(`FAILED at ${step}: ${String(err.message).split('\n')[0]}`);
}
console.log('logged in after:', await loggedIn());
await browser.close().catch(() => {});
