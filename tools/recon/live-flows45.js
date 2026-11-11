// @ts-nocheck: a live check script; it drives the panel and only counts what comes back.
/* global chrome */
// Live check of Flows 4 and 5 through the panel in the debug Chrome: PWD, one office, a short date window, detail pages on.
// Public pages: works logged out. Prints counts and shapes only.
//   npm run chrome            (once; nothing to log in to)
//   node tools/recon/live-flows45.js
// OFFICE (default 1552, or all), FROM and TO (default 01/07/2025 to 31/12/2025) can be set as environment variables.
// Logged in: TAB=own uses the flow's page the owner opened from the menu, and never opens a portal page in a new tab
// (that can end the session, insight 64). Run one flow at a time: ONLY=Flow4 or ONLY=Flow5. It prints the login state
// from the portal's answer before and after, and whether the department can still be chosen (D35's open question).
// MAX=150 measures the run first and collects only if it is no bigger than that.
// Log each run in docs/recon/self-run-log.md.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const root = process.cwd();
const { chromium } = await import(pathToFileURL(path.join(root, 'node_modules/@playwright/test/index.mjs')).href);
const XLSX = await import(pathToFileURL(path.join(root, 'vendor/xlsx.js')).href);
const profile = JSON.parse(readFileSync(path.join(root, 'profiles/eprocure.gov.bd.json'), 'utf8'));
const OFFICE = process.env.OFFICE ?? '1552';
const FROM = process.env.FROM ?? '01/07/2025';
const TO = process.env.TO ?? '31/12/2025';
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const OWN = process.env.TAB === 'own';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222').catch(() => {
  console.error('No debug Chrome on port 9222. Run `npm run chrome`, then run this again.');
  process.exit(1);
});
const context = browser.contexts()[0];
/** The extension's ID, from the debug profile's own settings: the one loaded from this repo's dist/. */
function extensionId() {
  const prefs = JSON.parse(readFileSync(path.join(root, '.chrome-debug-profile', 'Default', 'Secure Preferences'), 'utf8'));
  const dist = path.join(root, 'dist').toLowerCase();
  return Object.entries(prefs.extensions?.settings ?? {}).find(([, v]) => (v.path ?? '').toLowerCase() === dist)?.[0];
}
let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
if (!sw) {
  // Its background sleeps when idle: opening one of its pages wakes it.
  const extId = extensionId();
  if (!extId) throw new Error('The extension is not loaded in the debug Chrome: load dist/ there once (chrome://extensions, Load unpacked).');
  const waking = await context.newPage();
  await waking.goto(`chrome-extension://${extId}/panel/index.html`).catch(() => {});
  sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://')) ?? (await context.waitForEvent('serviceworker', { timeout: 15000 }));
  await waking.close();
}
const id = new URL(sw.url()).host;
// Make sure the extension running is the build on disk, by its build stamp (D71): Chrome can keep a cached
// background after a restart, even though the version number it shows is the new one.
const stamp = /"(\d{4}-\d{2}-\d{2}T[\d:.]+Z)"/.exec(readFileSync(path.join(root, 'dist', 'background.js'), 'utf8'))?.[1];
const running = async () => {
  const p = await context.newPage();
  await p.goto(`chrome-extension://${id}/panel/index.html`).catch(() => {});
  const reply = await p.evaluate(() => chrome.runtime.sendMessage({ type: 'sw/ping' })).catch(() => null);
  await p.close();
  return reply?.buildId;
};
if ((await running()) !== stamp) {
  console.log('the running extension is not the build on disk: reloading it');
  await sw.evaluate(() => chrome.runtime.reload()).catch(() => {});
  await new Promise((r) => setTimeout(r, 4000));
  sw = context.serviceWorkers().find((w) => w.url().startsWith(`chrome-extension://${id}`)) ?? (await context.waitForEvent('serviceworker', { timeout: 15000 }));
  if ((await running()) !== stamp) throw new Error('Still not the build on disk after a reload: press the reload arrow in chrome://extensions.');
}
console.log('extension', await sw.evaluate(() => chrome.runtime.getManifest().version));

const cases = [
  { name: 'Flow 4', flowId: 'contract_info', date: 'sign_date', key: 'Tender/Proposal ID' },
  { name: 'Flow 5', flowId: 'experience_info', date: 'contract_start_date', key: 'Record ID' },
];

for (const c of cases) {
  if (only && !only.includes(c.name.replace(' ', ''))) continue;
  const flow = profile.flows[c.flowId];
  const pagePath = flow.page.url.split('?')[0];
  const page = OWN ? context.pages().find((p) => p.url().includes(pagePath)) : await context.newPage();
  if (!page) {
    console.log(`${c.name} SKIPPED: no ${c.name} tab open. Open it from the portal's menu, then run this again.`);
    continue;
  }
  // The portal's answer, not what the page shows: a page can keep Logout after the session ends (insight 64).
  const loggedIn = () => page.evaluate(async (states) => {
    const r = await fetch(states.sessionCheckUrl, { credentials: 'same-origin' });
    const d = new DOMParser().parseFromString(await r.text(), 'text/html');
    return !r.url.includes(states.sessionEnded.urlContains) && !!d.querySelector(states.logoutLink) && !d.querySelector(states.loginForm);
  }, profile.pageStates).catch(() => null);
  let step = 'opening';
  let panel = null;
  try {
    if (!OWN) await page.goto(profile.site.baseUrl + flow.page.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    console.log(`  ${c.name} logged in before: ${await loggedIn()}`);
    const tabId = await sw.evaluate(async (url) => (await chrome.tabs.query({})).find((t) => t.url?.includes(url))?.id, flow.page.url.split('?')[0]);
    panel = await context.newPage();
    panel.setDefaultTimeout(30000);
    await panel.goto(`chrome-extension://${id}/panel/index.html?tab=${tabId}`);
    await page.bringToFront();
    step = 'panel filters';
    // A finished run from an earlier check stays on this tab's panel until New search: clear it (its file was saved then).
    await panel.locator('[data-filter], #run-new').first().waitFor();
    await panel.waitForTimeout(1500);
    await panel.screenshot({ path: path.join(root, 'recon', 'raw', `live-flows45-start-${Date.now()}.png`), fullPage: true }).catch(() => {});
    if (await panel.locator('#run-new').isVisible()) {
      console.log('  an earlier finished run was on the panel: pressed New search');
      await panel.locator('#run-new').click();
    }
    // The panel reopens a tree that was left open (by design): close it, so the filters can be reached.
    if (await panel.locator('#picker-close').isVisible()) {
      console.log('  a tree left open earlier was restored: closed it');
      await panel.locator('#picker-close').click();
    }
    await panel.locator('[data-filter]').first().waitFor();
    // Department: Ministry of Housing and Public Works, then Public Works Department.
    step = 'department picker';
    // D35's open question: can a logged-in user choose another department here? Read from the page and the panel.
    const deptOnPage = await page.evaluate(() => [...document.querySelectorAll('select, input')].filter((e) => /dep(artment|t)/i.test(e.id) && e.type !== 'hidden').map((e) => `${e.id}:${e.disabled || e.readOnly ? 'locked' : 'open'}`).join(' '));
    console.log(`  department on the page: ${deptOnPage || 'none found'} | panel picker enabled: ${await panel.locator('#f-department-open').isEnabled().catch(() => 'missing')}`);
    await panel.locator('#f-department-open').click();
    const ministry = panel.locator('.tree li', { hasText: /Housing (and|&) Public Works/ }).first();
    step = 'ministry arrow';
    const pwd = panel.locator('.tree .node', { hasText: /^\s*Public Works Department/ }).first();
    // The panel remembers the last department, so the ministry may open already unfolded: only unfold it if it isn't.
    await panel.waitForTimeout(500);
    if (!(await pwd.isVisible())) await ministry.locator('.twist').first().click();
    await pwd.waitFor({ timeout: 15000 }).catch(async () => {
      throw new Error(`no Public Works Department under the ministry; under it: ${(await ministry.locator('.tree .node').allInnerTexts()).slice(0, 8).join(' | ')}`);
    });
    await pwd.click();
    await panel.locator(`[data-count="procuring_entity"]`).filter({ hasText: /\d{2,} items/ }).waitFor();
    // One office, from the office picker; OFFICE=all leaves every office of the department.
    if (OFFICE !== 'all') {
      const officeName = await page.evaluate((v) => [...document.getElementById('cmbOffice').options].find((o) => o.value.trim() === v)?.text.trim(), OFFICE);
      step = 'office picker';
      await panel.locator('#f-procuring_entity').click();
      await panel.locator('#offices-search').fill(officeName);
      step = 'office tick';
      await panel.locator(`input[data-office="${OFFICE}"]`).first().check();
      step = 'office done';
      await panel.locator('#offices-done').click();
    }
    // A short date window.
    // Typed as a person does: an instant fill can land in a box the panel is just redrawing and add to the old date.
    for (const [part, value] of [['from', FROM], ['to', TO]]) {
      await panel.locator(`#f-${c.date}-${part}`).click();
      await panel.keyboard.press('Control+A');
      await panel.keyboard.type(value, { delay: 40 });
      await panel.locator(`#f-${c.date}-${part}`).blur();
      await panel.waitForTimeout(800);
    }
    const typed = [await panel.locator(`#f-${c.date}-from`).inputValue(), await panel.locator(`#f-${c.date}-to`).inputValue()];
    if (typed[0] !== FROM || typed[1] !== TO) throw new Error(`the dates read back as ${typed.join(' to ')}`);
    await panel.waitForTimeout(800);
    const reasons = await panel.locator('#start-reasons').count() ? await panel.locator('#start-reasons').innerText() : '';
    if (reasons) throw new Error(`Start is held: ${reasons}`);
    step = 'Start';
    await panel.locator('#start').click();
    await panel.locator('#plan-count').waitFor({ timeout: 90000 });
    const plan = await panel.locator('#plan-count').textContent();
    const planRows = Number(plan.replace(/\D/g, ''));
    // MAX: measure only, and stop before collecting if the run is bigger than this (the smallest selection that proves the point).
    if (process.env.MAX && planRows > Number(process.env.MAX)) {
      console.log(`  ${c.name}: plan ${plan}, over MAX ${process.env.MAX}: not collected. Try a narrower window.`);
      await panel.locator('#plan-close').click().catch(() => {});
      await panel.close();
      continue;
    }
    // The page shows the same search (D53): its own page count.
    await page.waitForTimeout(4000);
    const pagePages = await page.evaluate(() => document.getElementById('totalPages')?.value ?? document.querySelector('[id="totalPages"]')?.getAttribute('value') ?? null);
    const pageRows = await page.evaluate(() => ({
      rows: [...document.querySelectorAll('#resultTable tr')].filter((r) => r.querySelector('td')).length,
      noRecord: !!document.getElementById('noRecordFound'),
      office: document.getElementById('cmbOffice')?.value,
      dates: [...document.querySelectorAll('input')].filter((i) => /contract(Signe|Start)(Date|Dt)/i.test(i.id)).map((i) => `${i.id}=${i.value}`).join(' '),
    }));
    console.log(`  ${c.name} page after its own Search: ${JSON.stringify(pageRows)}`);
    // Every field group ticked.
    for (const box of await panel.locator('input[data-cluster]').all()) await box.check();
    if (await panel.locator('#plan-agree-line').isVisible()) await panel.locator('#plan-agree').check();
    step = `Start collecting, plan ${plan}, button disabled ${await panel.locator('#run-start').isDisabled()}`;
    await panel.locator('#run-start').click();
    const t0 = Date.now();
    await panel.locator('#run-state').filter({ hasText: /Finished|Paused|Stopped/ }).waitFor({ timeout: 20 * 60000 });
    const state = (await panel.locator('#run-view').innerText()).replace(/\s+/g, ' ').slice(0, 220);
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
    const read = data.filter((r) => r['Detail page'] === 'Read').length;
    const keys = new Set(data.map((r) => r[c.key])).size;
    const filled = (h) => data.filter((r) => r[h] !== undefined && r[h] !== '').length;
    const detailHeads = Object.keys(data[0] ?? {}).filter((h) => !h.startsWith('Filter:'));
    const emptyDetail = detailHeads.filter((h) => filled(h) === 0);
    const verdict = XLSX.utils.sheet_to_json(book.Sheets['About this grab'], { header: 1 }).find((r) => r[0] === 'Verdict')?.[1];
    console.log(`${c.name}: plan ${plan} (page shows ${pagePages} pages at size 10) | file ${data.length} rows, ${keys} distinct ${c.key}, detail read ${read} | columns ${detailHeads.length}, always empty: ${emptyDetail.length} | verdict ${verdict} | ${Math.round((Date.now() - t0) / 1000)} s | panel: ${state}`);
    if (emptyDetail.length) console.log(`  empty in every row: ${emptyDetail.join('; ')}`);
    console.log(`  rows match plan: ${data.length === planRows}`);
    await panel.close();
  } catch (err) {
    console.log(`${c.name} FAILED at ${step}: ${String(err.message).split('\n')[0]}`);
    // The panel as it was, to see why. Kept in the git-ignored recon/raw/.
    const shot = path.join(root, 'recon', 'raw', `live-flows45-fail-${Date.now()}.png`);
    if (panel) await panel.screenshot({ path: shot, fullPage: true }).then(() => console.log(`  panel screenshot: ${shot}`), () => {});
  } finally {
    console.log(`  ${c.name} logged in after: ${await loggedIn()}`);
    if (panel) await panel.close().catch(() => {});
    if (!OWN) await page.close().catch(() => {}); // the owner's own tab stays open
  }
}
await browser.close().catch(() => {});
