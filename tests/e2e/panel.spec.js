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
  context.setDefaultTimeout(10000); // a stuck click then names itself, rather than timing the whole test out
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

/** Long lists are search boxes, short ones plain dropdowns. */
async function choose(panel, id, label) {
  const box = panel.locator(`#f-${id}`);
  if ((await box.evaluate((el) => el.tagName)) === 'SELECT') return box.selectOption({ label });
  await box.click();
  await panel.locator(`#f-${id}-list li`, { hasText: label }).first().click();
}
const openMore = (panel) => panel.locator('#more-filters summary').click();

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
    await expect(t.panel.locator('#flow-name')).toHaveText('Tender Info');
    await expect(t.panel.locator('#flow-head')).toContainText('FLOW 2');
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
    await openMore(t.panel);
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
    // The list stays on its "no selection" entry: nothing is filtered until the user chooses (owner, 2026-11-07).
    expect((await t.page.locator('#cmbOffice').inputValue()).trim()).toBe('');
    await openMore(t.panel);
    await expect(t.panel.locator('#f-procuring_entity')).toHaveValue('All');
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
    await expect(t.panel.locator('#flow-view')).toContainText('needs a login');
    await expect(t.panel.locator('[data-filter]')).toHaveCount(0);
  } finally { await t.close(); }
});

test('Flow 1 logged in: three filters, All offices by default', async () => {
  const t = await setup({ loggedIn: true });
  try {
    await t.open('procurement_transaction_report');
    await expect(t.panel.locator('[data-filter]')).toHaveCount(3);
    await expect(t.panel.locator('#f-pe_office')).toHaveValue(/^All offices \([\d,]+\)$/);
    await expect(t.panel.locator('#start-reasons')).toContainText('Financial Year');
    await choose(t.panel, 'financial_year', '2024-2025');
    await expect(t.panel.locator('#plan')).toContainText('Filters are ready.');
    expect(await t.page.locator('#cmbFinancialYear').inputValue()).toBe('2024-2025');
  } finally { await t.close(); }
});

test('Flows 3, 4, 5: all filters, required rules named', async () => {
  const t = await setup();
  try {
    for (const [id, count, reason] of [['app_info', 11, 'Ministry/Division/Organization'], ['contract_info', 15, 'Contract Sign Date, Procuring Entity'], ['experience_info', 13, 'Contract Start Date']]) {
      await t.open(id);
      await expect(t.panel.locator('[data-filter]')).toHaveCount(count);
      await expect(t.panel.locator('#start-warning')).toHaveCount(0);
      await expect(t.panel.locator('#start-reasons')).toContainText(reason);
    }
    // Flow 5 Tender Type starts at All (the page's default is eTenders), and a contractor lifts the rule.
    await openMore(t.panel);
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

test('opening a branch keeps the list where it is, and children sit on a tinted background', async () => {
  const t = await setup();
  try {
    await t.open('contract_info');
    await t.panel.addStyleTag({ content: '.sheet-body { flex: none; height: 200px; }' });
    await t.panel.locator('#f-department-open').click();
    const body = t.panel.locator('.sheet-body');
    const twists = t.panel.locator('.twist');
    await expect(twists.first()).toBeVisible();
    // The last branch, scrolled to: a long way down the list, which is where the jump used to hurt.
    const target = twists.nth((await twists.count()) - 1);
    await target.scrollIntoViewIfNeeded();
    const before = await body.evaluate((el) => el.scrollTop);
    expect(before).toBeGreaterThan(0);
    await target.click();
    await expect(target).toHaveAttribute('aria-expanded', 'true');
    await t.panel.waitForTimeout(200);
    expect(await body.evaluate((el) => el.scrollTop)).toBe(before);
    const nested = t.panel.locator('.tree .tree').last();
    await expect(nested).toBeVisible();
    expect(await nested.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  } finally { await t.close(); }
});

test('clicking or choosing never moves the filters (owner, 2026-11-07)', async () => {
  const t = await setup();
  try {
    await t.open('tender_info');
    await t.panel.locator('#warning-proceed').click();
    await t.panel.locator('#f-department-open').click();
    await t.panel.locator('.tree .node').first().click();
    await expect(t.panel.locator('[data-count="procuring_entity"]')).toHaveText(/^\d{2,} items$/);
    await openMore(t.panel);
    // Short enough that the filters scroll, as they do in a real side panel.
    await t.panel.addStyleTag({ content: '#screen { flex: none; height: 420px; }' });
    const screen = t.panel.locator('#screen');
    const cards = t.panel.locator('[data-filter]');
    /** Where every filter sits on screen, and the scroll position. */
    const places = () => t.panel.evaluate(() => ({
      scroll: document.getElementById('screen').scrollTop,
      tops: Object.fromEntries([...document.querySelectorAll('[data-filter]')].map((el) => [el.dataset.filter, Math.round(el.getBoundingClientRect().top)])),
    }));
    /** The filter acted on must stay exactly where it was, at each moment given. */
    const stays = async (id, name, act) => {
      const card = t.panel.locator(`[data-filter="${id}"]`);
      await card.evaluate((el) => { el.scrollIntoView({ block: 'center' }); });
      const before = await places();
      await act();
      await t.panel.waitForTimeout(300); // long enough for the page's answer and the redraw
      const after = await places();
      expect(after.tops[id], `${name}: the filter moved`).toBe(before.tops[id]);
    };

    // A long list: opening it floats over the filters, leaving each of them where it was.
    await stays('procuring_entity', 'opening a long list', () => t.panel.locator('#f-procuring_entity').click());
    await expect(t.panel.locator('#f-procuring_entity')).toBeFocused();
    await expect(t.panel.locator('#f-procuring_entity-list')).toBeVisible();
    const open = await places();
    await t.panel.locator('#f-procuring_entity-list').evaluate((el) => { el.scrollTop = 80; });
    expect(await places()).toEqual(open);
    const box = await t.panel.locator('#f-procuring_entity-list').boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(t.panel.viewportSize().height);

    // Choosing from it: the list closes and stays closed, and nothing moves.
    await stays('procuring_entity', 'choosing from a long list', () => t.panel.locator('#f-procuring_entity-list li').nth(5).click());
    await expect(t.panel.locator('#f-procuring_entity-list')).toBeHidden();
    await expect(t.panel.locator('#f-procuring_entity')).toHaveAttribute('aria-expanded', 'false');

    // A short list, a tick, a typed value.
    await stays('procurement_nature', 'a short list', () => t.panel.locator('#f-procurement_nature').selectOption({ label: 'Works' }));
    await stays('publishing_date', 'a date tick', () => t.panel.locator('#f-publishing_date-from-today').uncheck());
    await stays('tender_id', 'a typed value', async () => {
      await t.panel.locator('#f-tender_id').fill('12345');
      await t.panel.locator('#f-tender_id').blur();
    });

    // A filter above the one in use changing size doesn't move it: Department's name returns after a clear.
    await stays('department', 'clearing Department', () => t.panel.locator('#f-department-clear').click());

    // The last filter, with the panel scrolled right to its end, where a shrinking page would drag it.
    const lastId = await cards.last().getAttribute('data-filter');
    const last = t.panel.locator(`[data-filter="${lastId}"]`).locator('select, input').first();
    await screen.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const end = await places();
    if ((await last.evaluate((el) => el.tagName)) === 'SELECT') await last.selectOption({ index: 1 });
    else {
      await last.fill('1');
      await last.blur();
    }
    await t.panel.waitForTimeout(300);
    expect((await places()).tops[lastId], 'the last filter moved').toBe(end.tops[lastId]);
  } finally { await t.close(); }
});

test('what the user set survives the panel being closed and reopened on its tab (D45)', async () => {
  const t = await setup();
  try {
    await t.open('tender_info');
    await t.panel.locator('#warning-proceed').click();
    await t.panel.locator('#f-publishing_date-from-today').uncheck();
    await t.panel.locator('#f-publishing_date-from').fill('01/01/2024');
    await t.panel.locator('#f-publishing_date-from').blur();
    await expect(t.panel.locator('#window-span')).toContainText('01/01/2024');
    await t.panel.locator('#f-department-open').click();
    await expect(t.panel.locator('.tree .node').first()).toBeVisible();
    await t.panel.waitForTimeout(250); // the save waits a moment
    await t.panel.reload();
    await t.page.bringToFront();
    await expect(t.panel.locator('#start-warning')).toHaveCount(0);
    await expect(t.panel.locator('#f-publishing_date-from')).toHaveValue('01/01/2024');
    await expect(t.panel.locator('#sheet .tree .node').first()).toBeVisible();
    // A reloaded page is a clean page, so the panel starts clean too; the warning's answer stays.
    await t.panel.locator('#picker-close').click();
    await t.page.reload();
    await expect(t.panel.locator('#f-publishing_date-from-today')).toBeChecked();
    await expect(t.panel.locator('#start-warning')).toHaveCount(0);
  } finally { await t.close(); }
});

test('the block check reads what a user sees, not the page\'s scripts', async () => {
  const t = await setup();
  try {
    await t.open('tender_info');
    // The real page's login code mentions the word; the fake portal's pages have no scripts, so it's added here.
    await t.page.evaluate(() => {
      const s = document.createElement('script');
      s.type = 'text/plain';
      s.textContent = 'var servercaptcha = 1;';
      document.body.append(s);
    });
    await t.panel.reload();
    await t.page.bringToFront();
    await expect(t.panel.locator('#page-match')).toBeVisible();
    // A page that really shows the word to the user does stop.
    await t.page.evaluate(() => document.body.append('Please complete the captcha'));
    await t.panel.reload();
    await t.page.bringToFront();
    await expect(t.panel.locator('#flow-view')).toContainText('block or CAPTCHA');
  } finally { await t.close(); }
});
