/* global chrome */
// Whole runs on the fake portal: filters, plan, collection, the Excel file, and what happens when things go wrong.
// Run `npm run build` first.
import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from '../../vendor/xlsx.js';
import { createMockPortal } from '../mock-server/server.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const dist = path.join(root, 'dist');
const profile = JSON.parse(await readFile(path.join(root, 'profiles/eprocure.gov.bd.json'), 'utf8'));
const BASE = profile.site.baseUrl;

async function launch(userDataDir, mock, paceMs = 5) {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  context.setDefaultTimeout(15000);
  await context.route(/^https?:\/\//, async (route) => {
    const url = route.request().url();
    if (!url.startsWith(BASE)) return route.abort();
    try {
      const res = await fetch(mock + url.slice(BASE.length), {
        method: route.request().method(),
        headers: { 'Content-Type': route.request().headers()['content-type'] ?? 'text/plain' },
        body: route.request().postData() ?? undefined,
        redirect: 'follow',
      });
      return await route.fulfill({ status: res.status, contentType: res.headers.get('content-type') ?? 'text/html', body: await res.text() });
    } catch {
      return route.abort(); // the fake portal dropped the connection, as a lost network would
    }
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate((ms) => chrome.storage.session.set({ testPaceMs: ms }), paceMs);
  const page = await context.newPage();
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true }))[0].id);
  const panel = await context.newPage();
  const ext = new URL(worker.url()).host;
  return { context, worker, page, panel, tabId, ext };
}

async function setup({ rows = 30, loggedIn = false, paceMs = 5, latencyMs = 0 } = {}) {
  const portal = createMockPortal({ rows: { tender_info: rows, app_info: rows, contract_info: rows, experience_info: rows }, loggedIn, latencyMs });
  const mock = await portal.start();
  const dir = await mkdtemp(path.join(os.tmpdir(), 'egp-run-'));
  const t = { portal, mock, dir, ...(await launch(dir, mock, paceMs)) };
  t.open = async (flowId) => {
    await t.page.goto(BASE + profile.flows[flowId].page.url);
    await t.panel.goto(`chrome-extension://${t.ext}/panel/index.html?tab=${t.tabId}`);
  };
  t.close = async () => {
    await t.context.close();
    await rm(dir, { recursive: true, force: true });
    await portal.stop();
  };
  return t;
}

/** Sets up Flow 2's two required filters, as a user would. */
async function chooseDepartment(t) {
  await t.panel.locator('#f-department-open').click();
  await t.panel.locator('.tree .node').first().click();
  await expect(t.panel.locator('#f-department-shown')).not.toHaveText('Not chosen');
}

async function flow2Plan(t) {
  await t.open('tender_info');
  await t.panel.locator('#warning-proceed').click();
  await chooseDepartment(t);
  await expect(t.panel.locator('#start')).toBeEnabled();
  await t.panel.locator('#start').click();
  await expect(t.panel.locator('#plan-count')).toBeVisible();
}

const cluster = (t, id) => t.panel.locator(`input[data-cluster="${id}"]`);
const state = (t) => t.panel.locator('#run-state');

/** The file the panel just downloaded, read back. */
async function downloaded(t) {
  // The browser under test saves under its own name, so the name is read where the panel gives it.
  await t.panel.evaluate(() => {
    const real = chrome.downloads.download.bind(chrome.downloads);
    chrome.downloads.download = (options) => {
      window.lastDownload = options.filename;
      return real(options);
    };
  });
  await t.panel.locator('#run-download').click();
  await expect.poll(async () => t.worker.evaluate(async () => {
    const [item] = await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 });
    return item?.state;
  })).toBe('complete');
  const item = await t.worker.evaluate(async () => (await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 }))[0]);
  const book = XLSX.read(await readFile(item.filename), { type: 'buffer' });
  const name = await t.panel.evaluate(() => window.lastDownload);
  return { name, book, data: XLSX.utils.sheet_to_json(book.Sheets.Data, { raw: true }) };
}

test('Flow 2, whole journey: measure, choose, collect, download', async () => {
  const t = await setup({ rows: 230 });
  try {
    await flow2Plan(t);
    // The real size, read from the portal; nothing ticked until the user chooses (D25).
    await expect(t.panel.locator('#plan-count')).toHaveText('230 rows');
    await expect(t.panel.locator('#plan-estimate')).toContainText('List only');
    await expect(cluster(t, 'identity')).not.toBeChecked();
    await cluster(t, 'identity').check();
    await cluster(t, 'dates').check();
    await expect(t.panel.locator('#plan-estimate')).toContainText('detail pages');
    const before = t.portal.state.requests.length;
    await t.panel.locator('#run-start').click();
    await expect(state(t)).toHaveText('Finished', { timeout: 60000 });
    await expect(t.panel.locator('#run-numbers')).toContainText('230 of 230');
    // 3 list pages and 230 detail pages, each asked for once. No tab opened.
    const made = t.portal.state.requests.slice(before);
    expect(made.filter((r) => r.path === profile.flows.tender_info.detail.open.url)).toHaveLength(230);
    expect(made.filter((r) => r.path === profile.flows.tender_info.list.request.url)).toHaveLength(3);
    expect(t.context.pages()).toHaveLength(3);
    const file = await downloaded(t);
    expect(file.name).toMatch(/^pdms_tender_info_.*\.xls$/);
    expect(file.book.SheetNames).toEqual(['About this grab', 'Data']);
    expect(file.data).toHaveLength(230);
    expect(new Set(file.data.map((r) => r['Tender/Proposal ID'])).size).toBe(230);
    expect(file.data[0]['Filter: Ministry/Division/Organization']).toBeTruthy();
    expect(file.data[0]['Filter: Status']).toBe('All');
    expect(file.data[0]['App ID']).toBeDefined();
    expect(file.data[0]['Budget Type']).toBeUndefined();
    // New search goes back to the filters.
    await t.panel.locator('#run-new').click();
    await expect(t.panel.locator('[data-filter]').first()).toBeVisible();
  } finally { await t.close(); }
});

test('Start presses the page\'s own Search, and a group opens to choose its fields', async () => {
  const t = await setup({ rows: 12 });
  try {
    await t.open('tender_info');
    await t.panel.locator('#warning-proceed').click();
    await chooseDepartment(t);
    await t.page.evaluate(() => {
      window.searchPressed = 0;
      document.querySelector('#btnSearch').addEventListener('click', () => { window.searchPressed += 1; });
    });
    await t.panel.locator('#start').click();
    await expect(t.panel.locator('#plan-count')).toHaveText('12 rows');
    await expect.poll(() => t.page.evaluate(() => window.searchPressed)).toBe(1);
    // The group opens; one field is ticked; the group shows it's partly ticked; the file holds just that field.
    const fields = t.panel.locator('#fields-identity');
    await expect(fields).toBeHidden();
    await t.panel.locator('.twist').first().click();
    await expect(fields).toBeVisible();
    await t.panel.locator('input[data-field="app_id"]').check();
    await expect(t.panel.locator('[data-count="identity"]')).toHaveText(/^1 of \d+ fields$/);
    expect(await cluster(t, 'identity').evaluate((el) => el.indeterminate)).toBe(true);
    await cluster(t, 'dates').check();
    await expect(t.panel.locator('[data-count="dates"]')).toHaveText(/^All \d+ fields$/);
    await cluster(t, 'dates').uncheck();
    await t.panel.locator('#run-start').click();
    await expect(state(t)).toHaveText('Finished', { timeout: 30000 });
    const file = await downloaded(t);
    expect(file.name).toMatch(/\.xls$/);
    const headers = Object.keys(file.data[0]);
    expect(headers).toContain('App ID');
    expect(headers).not.toContain('Event Type');
    expect(headers).not.toContain('Opening Date and Time');
  } finally { await t.close(); }
});

test('with nothing ticked it collects the list only', async () => {
  const t = await setup({ rows: 40 });
  try {
    await flow2Plan(t);
    await t.panel.locator('#run-start').click();
    await expect(state(t)).toHaveText('Finished');
    expect(t.portal.state.requests.filter((r) => r.path === profile.flows.tender_info.detail.open.url)).toHaveLength(0);
    const file = await downloaded(t);
    expect(file.data).toHaveLength(40);
    expect(file.data[0].Title).toBeTruthy();
  } finally { await t.close(); }
});

test('rows lost to the portal\'s sorting are found by a second search', async () => {
  const t = await setup({ rows: 250 });
  try {
    await flow2Plan(t);
    t.portal.setFaults({ unstableOrder: true });
    await t.panel.locator('#run-start').click();
    await expect(state(t)).toHaveText('Finished', { timeout: 60000 });
    const file = await downloaded(t);
    expect(new Set(file.data.map((r) => r['Tender/Proposal ID'])).size).toBe(250);
    expect(t.portal.rowIds('tender_info').every((id) => file.data.some((r) => r['Tender/Proposal ID'] === id))).toBe(true);
  } finally { await t.close(); }
});

test('a block stops the run at once, with nothing retried and nothing lost', async () => {
  const t = await setup({ rows: 20, paceMs: 40 });
  try {
    await flow2Plan(t);
    await cluster(t, 'identity').check();
    await t.panel.locator('#run-start').click();
    await expect(t.panel.locator('#run-numbers')).toContainText(/Detail pages read[1-9]/);
    t.portal.setFaults({ block: true });
    await expect(state(t)).toHaveText('Paused');
    await expect(t.panel.locator('#run-view')).toContainText('block or CAPTCHA');
    const count = t.portal.state.requests.length;
    await t.panel.waitForTimeout(500);
    expect(t.portal.state.requests.length).toBe(count);
    // What was collected can still be downloaded, marked partial.
    const file = await downloaded(t);
    expect(file.name).toContain('_partial');
    expect(file.data).toHaveLength(20);
  } finally { await t.close(); }
});

test('the network going down pauses; on return it resumes with nothing lost', async () => {
  const t = await setup({ rows: 30, paceMs: 40 });
  try {
    await flow2Plan(t);
    await cluster(t, 'identity').check();
    await t.panel.locator('#run-start').click();
    await expect(t.panel.locator('#run-numbers')).toContainText(/Detail pages read[1-9]/);
    t.portal.setFaults({ drop: true });
    await expect(state(t)).toHaveText('Paused', { timeout: 30000 });
    await expect(t.panel.locator('#run-view')).toContainText("isn't answering");
    t.portal.setFaults({});
    await t.panel.locator('#run-resume').click();
    await expect(state(t)).toHaveText('Finished', { timeout: 60000 });
    await expect(t.panel.locator('#run-numbers')).toContainText('30 of 30');
    const file = await downloaded(t);
    expect(file.data).toHaveLength(30);
    expect(file.data.every((r) => ['Read', 'Refused by portal'].includes(r['Detail page']))).toBe(true);
  } finally { await t.close(); }
});

test('the user can pause, resume, stop; Stop keeps what was collected', async () => {
  const t = await setup({ rows: 40, paceMs: 60 });
  try {
    await flow2Plan(t);
    await cluster(t, 'identity').check();
    await t.panel.locator('#run-start').click();
    await t.panel.locator('#run-pause').click();
    await expect(state(t)).toHaveText('Paused');
    await t.panel.locator('#run-resume').click();
    await expect(state(t)).toHaveText('Collecting');
    await t.panel.locator('#run-stop').click();
    await expect(state(t)).toHaveText('Stopped');
    const file = await downloaded(t);
    expect(file.name).toContain('_partial');
    const about = XLSX.utils.sheet_to_json(file.book.Sheets['About this grab'], { header: 1 }).flat();
    expect(about.join(' ')).toContain('Partial');
  } finally { await t.close(); }
});

test('closing Chrome mid-run: on reopening, the panel offers to resume, and nothing is lost', async () => {
  const t = await setup({ rows: 30, paceMs: 80 });
  try {
    await flow2Plan(t);
    await cluster(t, 'identity').check();
    await t.panel.locator('#run-start').click();
    await expect(t.panel.locator('#run-numbers')).toContainText(/Detail pages read[1-9]/);
    await t.context.close();

    const again = await launch(t.dir, t.mock, 5);
    t.context = again.context;
    await again.page.goto(BASE + profile.flows.tender_info.page.url);
    await again.panel.goto(`chrome-extension://${again.ext}/panel/index.html?tab=${again.tabId}`);
    t.panel = again.panel;
    t.worker = again.worker;
    await expect(state(t)).toHaveText('Paused');
    await expect(t.panel.locator('#run-view')).toContainText(/Chrome was closed|tab was closed/);
    await t.panel.locator('#run-resume').click();
    await expect(state(t)).toHaveText('Finished', { timeout: 60000 });
    const file = await downloaded(t);
    expect(file.data).toHaveLength(30);
    expect(new Set(file.data.map((r) => r['Tender/Proposal ID'])).size).toBe(30);
    expect(file.data.every((r) => ['Read', 'Refused by portal'].includes(r['Detail page']))).toBe(true);
  } finally { await t.close(); }
});

test('the run goes on while the user moves about, and the panel comes back to it', async () => {
  const t = await setup({ rows: 25, paceMs: 40 });
  try {
    await flow2Plan(t);
    await cluster(t, 'identity').check();
    await t.panel.locator('#run-start').click();
    await expect(state(t)).toHaveText('Collecting');
    // The panel closes when the user leaves the tab. The run doesn't care.
    await t.panel.close();
    await t.page.waitForTimeout(300);
    // A reload of the e-GP page: if Chrome asks first (D48, only after a click in the page), the user goes ahead, and the run carries on.
    t.page.on('dialog', (dialog) => dialog.accept());
    await t.page.reload();
    const panel = await t.context.newPage();
    await panel.goto(`chrome-extension://${t.ext}/panel/index.html?tab=${t.tabId}`);
    t.panel = panel;
    await expect(state(t)).toHaveText('Finished', { timeout: 60000 });
    await expect(panel.locator('#run-numbers')).toContainText('25 of 25');
  } finally { await t.close(); }
});

for (const [flowId, key, clusterId] of [['app_info', 'Package ID', 'package'], ['contract_info', 'Contract ID', 'contract'], ['experience_info', 'Record ID', 'company']]) {
  test(`${flowId}: collects list and detail, one row each`, async () => {
    const t = await setup({ rows: 12 });
    try {
      await t.open(flowId);
      await chooseDepartment(t);
      const flow = profile.flows[flowId];
      const dated = flow.rules.window?.filter;
      if (dated) {
        await t.panel.locator(`#f-${dated}-from`).fill('01/01/2024');
        await t.panel.locator(`#f-${dated}-from`).blur();
        await t.panel.locator(`#f-${dated}-to`).fill('31/12/2024');
        await t.panel.locator(`#f-${dated}-to`).blur();
      } else {
        const year = t.panel.locator('#f-financial_year');
        await year.selectOption({ index: 1 }).catch(async () => {
          await year.click();
          await t.panel.locator('#f-financial_year-list li').nth(1).click();
        });
      }
      await expect(t.panel.locator('#start-reasons')).toHaveCount(0);
      await expect(t.panel.locator('#start')).toBeEnabled();
      await t.panel.locator('#start').click();
      await expect(t.panel.locator('#plan-count')).toHaveText('12 rows');
      await cluster(t, clusterId).check();
      await t.panel.locator('#run-start').click();
      await expect(state(t)).toHaveText('Finished', { timeout: 30000 });
      const file = await downloaded(t);
      expect(file.data).toHaveLength(12);
      expect(new Set(file.data.map((r) => r[key])).size).toBe(12);
      expect(file.data.every((r) => r['Detail page'] === 'Read')).toBe(true);
    } finally { await t.close(); }
  });
}

test('Flow 1, logged in: an office grab gives one sheet per budget, with each office\'s rows and totals (D65)', async () => {
  const t = await setup({ loggedIn: true, paceMs: 1 });
  try {
    await t.open('procurement_transaction_report');
    await expect(t.panel.locator('#start-reasons')).toContainText('Choose one of: Financial Year or Project.');
    await t.panel.locator('#f-financial_year').click();
    await t.panel.locator('#f-financial_year-list li').nth(1).click();
    await expect(t.panel.locator('#start')).toBeEnabled();
    await t.panel.locator('#start').click();
    await expect(t.panel.locator('#plan-count')).toContainText('reports');
    const reports = Number((await t.panel.locator('#plan-count').textContent()).replace(/\D/g, ''));
    await t.panel.locator('input[data-scope="national"]').check();
    await t.panel.locator('#run-start').click();
    await expect(state(t)).toHaveText('Finished', { timeout: 60000 });
    const file = await downloaded(t);
    expect(file.book.SheetNames).toEqual(['About this grab', 'Development', 'Revenue', 'Own Fund']);
    const own = XLSX.utils.sheet_to_json(file.book.Sheets['Own Fund'], { raw: true });
    expect(own.filter((r) => r['Method of Procurement'] === 'GRAND TOTAL')).toHaveLength(reports);
    expect(own[0]['Financial Year']).toBeTruthy();
    expect(Object.keys(own[0]).some((h) => h.includes('International'))).toBe(false);
  } finally { await t.close(); }
});

test('Flow 1: a project grab loops every year to the current one, for one office', async () => {
  const t = await setup({ loggedIn: true, paceMs: 1 });
  try {
    await t.open('procurement_transaction_report');
    await t.panel.locator('#f-project').click();
    await t.panel.locator('#f-project-list li').nth(1).click();
    await t.panel.locator('#f-pe_office').click();
    await t.panel.locator('#offices-search').fill('Rajshahi PWD Division-1');
    await t.panel.locator('input[data-office]:visible').first().check();
    await t.panel.locator('#offices-done').click();
    await expect(t.panel.locator('#start')).toBeEnabled();
    await t.panel.locator('#start').click();
    await expect(t.panel.locator('#plan-sizes')).toContainText('× 1 office');
    await expect(t.panel.locator('#plan-sizes')).toContainText('Project:');
    await t.panel.locator('#run-start').click();
    await expect(state(t)).toHaveText('Finished', { timeout: 60000 });
    const file = await downloaded(t);
    const dev = XLSX.utils.sheet_to_json(file.book.Sheets.Development, { raw: true });
    expect(new Set(dev.map((r) => r['Financial Year'])).size).toBeGreaterThan(5);
    expect(dev[0].Project).toBeTruthy();
  } finally { await t.close(); }
});

test('several offices (D66): Flow 2 searches each one; Flow 1 reports only those', async () => {
  const t = await setup({ rows: 30, loggedIn: false });
  try {
    await t.open('tender_info');
    await t.panel.locator('#warning-proceed').click();
    await chooseDepartment(t);
    await t.panel.locator('#f-procuring_entity').click();
    await t.panel.locator('#offices-search').fill('Rajshahi PWD Division');
    await t.panel.locator('input[data-office]:visible').nth(0).check();
    await t.panel.locator('input[data-office]:visible').nth(1).check();
    await t.panel.locator('#offices-done').click();
    const listUrl = profile.flows.tender_info.list.request.url;
    const before = t.portal.state.requests.filter((r) => r.path === listUrl).length;
    await t.panel.locator('#start').click();
    await expect(t.panel.locator('#plan-count')).toBeVisible();
    await t.panel.locator('#run-start').click();
    await expect(state(t)).toHaveText('Finished', { timeout: 60000 });
    // Two measuring requests, then a sweep per office. The fake portal gives every office the same 30 rows, kept once;
    // so the second office looks short and gets the second search too. On the real portal each office has its own rows.
    expect(t.portal.state.requests.filter((r) => r.path === listUrl).length - before).toBeGreaterThanOrEqual(4);
    const file = await downloaded(t);
    expect(file.data).toHaveLength(30);
    expect(file.data[0]['Filter: Procuring Entity']).toMatch(/^2 offices: /);
  } finally { await t.close(); }
});

test('a very long run: Start says the tick is what\'s missing, and starts once it\'s given (D27)', async () => {
  const t = await setup({ rows: 30000, paceMs: 200 });
  try {
    await flow2Plan(t);
    await expect(t.panel.locator('#plan-estimate')).not.toContainText('false');
    const go = t.panel.locator('#run-start');
    await expect(t.panel.locator('#plan-agree-line')).toBeHidden();
    await cluster(t, 'identity').check();
    await expect(t.panel.locator('#plan-estimate')).toContainText('Too long for one sitting');
    await expect(t.panel.locator('#plan-agree-line')).toBeVisible();
    await expect(go).toBeEnabled();
    await go.click();
    await expect(t.panel.locator('#plan-agree-line')).toHaveClass(/asked/);
    await expect(t.panel.locator('#plan-count')).toBeVisible();
    await t.panel.locator('#plan-agree').check();
    await go.click();
    await expect(state(t)).toHaveText('Collecting');
  } finally { await t.close(); }
}, 90000);

test('a contractor search over the limit is refused, with the reason (D22)', async () => {
  const t = await setup({ rows: 6000 });
  try {
    await t.open('experience_info');
    await t.panel.locator('#more-filters summary').click();
    await t.panel.locator('#f-company_unique_id').fill('1000001');
    await t.panel.locator('#f-company_unique_id').blur();
    await expect(t.panel.locator('#start')).toBeEnabled();
    await t.panel.locator('#start').click();
    await expect(t.panel.locator('#plan-count')).toHaveText('6,000 rows');
    await expect(t.panel.locator('.sheet-head')).toBeVisible();
    await expect(t.panel.locator('#sheet')).toContainText("can't go over 5,000 rows");
    await expect(t.panel.locator('#run-start')).toBeDisabled();
  } finally { await t.close(); }
});
