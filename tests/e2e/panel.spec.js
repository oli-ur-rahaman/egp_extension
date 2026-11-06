// The real panel on the fake portal. Every request to the portal's address is answered by the mock; any other outside request fails the test.
// Run `npm run build` first.
import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMockPortal } from '../mock-server/server.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const dist = path.join(root, 'dist');
const profile = JSON.parse(await readFile(path.join(root, 'profiles/eprocure.gov.bd.json'), 'utf8'));
const BASE = profile.site.baseUrl;

async function setup({ loggedIn = false } = {}) {
  const portal = createMockPortal({ rows: { tender_info: 30, app_info: 30, contract_info: 30, experience_info: 30 }, loggedIn });
  const mock = await portal.start();
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'egp-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  const outside = [];
  await context.route(/^https?:\/\//, async (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE)) {
      const res = await fetch(mock + url.slice(BASE.length), {
        method: route.request().method(),
        headers: { 'Content-Type': route.request().headers()['content-type'] ?? 'text/plain' },
        body: route.request().postData() ?? undefined,
        redirect: 'follow',
      });
      return route.fulfill({ status: res.status, contentType: res.headers.get('content-type') ?? 'text/html', body: await res.text() });
    }
    outside.push(url);
    return route.abort();
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${new URL(worker.url()).host}/panel/index.html`);
  const page = await context.newPage();
  const open = async (flowId) => {
    await page.goto(BASE + profile.flows[flowId].page.url);
    await page.bringToFront();
  };
  const close = async () => {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
    await portal.stop();
  };
  return { panel, page, open, close, outside, portal };
}

const filterCount = (panel) => panel.locator('[data-filter]').count();

test('shows the five flows when no report page is in front', async () => {
  const t = await setup();
  try {
    await t.page.goto(`${BASE}/`);
    await t.page.bringToFront();
    await expect(t.panel.locator('#no-page')).toContainText('Flow 5 · Experience Info');
    await expect(t.panel.locator('#no-page')).toContainText('needs a login');
  } finally { await t.close(); }
});

test('Flow 2 logged out: warns first, then shows all 13 filters', async () => {
  const t = await setup();
  try {
    await t.open('tender_info');
    await expect(t.panel.locator('#flow-name')).toHaveText('Flow 2 · Tender Info');
    await expect(t.panel.locator('#login-state')).toHaveText('Logged out');
    await expect(t.panel.locator('#start-warning')).toContainText("This page won't list LTM and some other methods.");
    expect(await filterCount(t.panel)).toBe(0);
    await t.panel.locator('#warning-proceed').click();
    await expect(t.panel.locator('[data-filter]')).toHaveCount(13);
    await expect(t.panel.locator('#start')).toBeDisabled();
    await expect(t.panel.locator('#start-reasons')).toContainText('Choose Ministry/Division/Organization');
    // Both date ticks start on today, so the window starts valid (D13). A window over 5 years is refused.
    await t.panel.locator('#f-publishing_date-from-today').uncheck();
    await t.panel.locator('#f-publishing_date-from').fill('01/01/2000');
    await t.panel.locator('#f-publishing_date-from').blur();
    await expect(t.panel.locator('#start-reasons')).toContainText('The limit is 5 years');
    expect(t.outside).toEqual([]);
  } finally { await t.close(); }
});

test('Flow 2: a panel change appears on the real page', async () => {
  const t = await setup();
  try {
    await t.open('tender_info');
    await t.panel.locator('#warning-proceed').click();
    await t.panel.locator('#f-procurement_nature').selectOption({ label: 'Works' });
    await expect.poll(() => t.page.locator('#procNature').inputValue()).toBe('2');
    await t.panel.locator('#f-tender_id').fill('12345');
    await t.panel.locator('#f-tender_id').blur();
    await expect.poll(() => t.page.locator('#tenderId').inputValue()).toBe('12345');
    // Status is a dropdown in the panel, default All (the page's own default is Live).
    await expect(t.panel.locator('#f-status')).toHaveValue('AllTenders');
    expect(await t.page.locator('#viewType').inputValue()).toBe('AllTenders');
  } finally { await t.close(); }
});

test('Flow 2: choosing a Department refills Procuring Entity from the page, and satisfies the rule', async () => {
  const t = await setup();
  try {
    await t.open('tender_info');
    await t.panel.locator('#warning-proceed').click();
    await t.panel.locator('#f-department-open').click();
    const first = t.panel.locator('.tree .node').first();
    await expect(first).toBeVisible();
    const name = await first.textContent();
    await first.click();
    await expect(t.panel.locator('#f-department-shown')).toHaveText(name);
    await expect.poll(() => t.page.locator('#txtdepartment').inputValue()).toBe(name);
    await expect(t.panel.locator('[data-count="procuring_entity"]')).toHaveText(/^\d{2,} items$/);
    // The window's ticks both default to today: a zero-length window is valid, so the filters are ready.
    await expect(t.panel.locator('#plan')).toContainText('Filters are ready.');
    await expect(t.panel.locator('#window-span')).toContainText('0 y 0 m');
  } finally { await t.close(); }
});

test('Flow 2 logged in: no warning, Department is fixed', async () => {
  const t = await setup({ loggedIn: true });
  try {
    await t.open('tender_info');
    await expect(t.panel.locator('#login-state')).toHaveText('Logged in');
    await expect(t.panel.locator('#start-warning')).toHaveCount(0);
    await expect(t.panel.locator('[data-filter="department"]')).toContainText('Fixed by your login');
    await expect(t.panel.locator('[data-filter]')).toHaveCount(13);
    await expect(t.panel.locator('[data-filter="budget_type"]')).toContainText('ignores this filter');
  } finally { await t.close(); }
});

test('Flow 1: login wall when logged out', async () => {
  const t = await setup();
  try {
    await t.open('procurement_transaction_report');
    await expect(t.panel.locator('#flow-head')).toContainText('needs a login');
    await expect(t.panel.locator('[data-filter]')).toHaveCount(0);
  } finally { await t.close(); }
});

test('Flow 1 logged in: two filters, All offices by default', async () => {
  const t = await setup({ loggedIn: true });
  try {
    await t.open('procurement_transaction_report');
    await expect(t.panel.locator('[data-filter]')).toHaveCount(2);
    await expect(t.panel.locator('#f-pe_office option').first()).toHaveText(/^All offices \(\d+\)$/);
    await expect(t.panel.locator('#start-reasons')).toContainText('Financial Year');
    await t.panel.locator('#f-financial_year').selectOption('2024-2025');
    await expect(t.panel.locator('#plan')).toContainText('Filters are ready.');
    expect(await t.page.locator('#cmbFinancialYear').inputValue()).toBe('2024-2025');
  } finally { await t.close(); }
});

test('Flows 3, 4, 5: all filters, required rules named', async () => {
  const t = await setup();
  try {
    for (const [id, count, reason] of [['app_info', 11, 'Ministry/Division/Organization'], ['contract_info', 15, 'Contract Sign Date'], ['experience_info', 13, 'Contract Start Date']]) {
      await t.open(id);
      await expect(t.panel.locator('[data-filter]')).toHaveCount(count);
      await expect(t.panel.locator('#start-warning')).toHaveCount(0);
      await expect(t.panel.locator('#start-reasons')).toContainText(reason);
    }
    // Flow 5 Tender Type starts at All (the page's default is eTenders), and a contractor lifts the rule.
    const type = t.panel.locator('#f-tender_type');
    await expect(type.locator('option:checked')).toHaveText('All');
    await t.panel.locator('#f-contract_awarded_to-text').fill('A firm');
    await t.panel.locator('#f-contract_awarded_to-text').blur();
    await expect(t.panel.locator('#plan')).toContainText('within 5,000 rows');
    await expect(t.panel.locator('#start-reasons')).toHaveCount(0);
  } finally { await t.close(); }
});

test('a block during a lookup stops with a clear message', async () => {
  const t = await setup();
  try {
    await t.open('contract_info');
    t.portal.setFaults({ block: true });
    await t.panel.locator('#f-department-open').click();
    await expect(t.panel.locator('#error')).toContainText('block or CAPTCHA');
    await expect(t.panel.locator('#status')).toHaveText('Stopped');
    t.portal.setFaults({});
  } finally { await t.close(); }
});
