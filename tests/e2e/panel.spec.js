/* global chrome */
// The real panel on the fake portal. Every request to the portal's address is answered by the mock; any other outside request fails the test.
// Run `npm run build` first.
import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from '../../vendor/xlsx.js';
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
    await expect(t.panel.locator('#f-procuring_entity')).toHaveText(/^All offices \(\d+\)/);
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
    await expect(t.panel.locator('#f-pe_office')).toHaveText(/^All offices \([\d,]+\)/);
    // D68: every filter has a default, so a run can start at once.
    await expect(t.panel.locator('#f-financial_year')).toHaveText(/All years, to the current one/);
    await expect(t.panel.locator('#f-project')).toHaveText(/Not set/);
    await expect(t.panel.locator('#plan')).toContainText('Filters are ready.');
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

    // The office picker (D66): choosing an office from it leaves the filter where it was.
    await stays('procuring_entity', 'choosing an office', async () => {
      await t.panel.locator('#f-procuring_entity').click();
      await t.panel.locator('[data-cluster="unplaced"]').locator('xpath=ancestor::div[1]').locator('.twist').click();
      await t.panel.locator('input[data-office]').first().check();
      await t.panel.locator('#offices-done').click();
    });
    await expect(t.panel.locator('#f-procuring_entity')).toHaveAttribute('data-offices', '1');

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

test('the office picker: clusters, kinds of office, several offices, and the hierarchy screen (D66)', async () => {
  // Finding boxes among 224 offices is slow for the test runner; for a user each step is under half a second.
  test.setTimeout(90000);
  const t = await setup();
  try {
    await t.open('tender_info');
    await t.panel.locator('#warning-proceed').click();
    await t.panel.locator('#f-department-open').click();
    await t.panel.locator('.tree .node').first().click();
    await expect(t.panel.locator('[data-count="procuring_entity"]')).toHaveText(/^\d{2,} items$/);
    const field = t.panel.locator('#f-procuring_entity');
    await field.click();
    // Offices that fit nowhere come first, as a cluster.
    await expect(t.panel.locator('#sheet .tree > li').first()).toContainText('Not in the hierarchy');
    // Every division office at once, then clear.
    await t.panel.locator('[data-level="4"]').click();
    await expect(t.panel.locator('[data-level="4"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(t.panel.locator('#offices-done')).toHaveText(/^Done \(\d{2,}\)$/);
    await t.panel.locator('#sheet .sheet-foot .btn', { hasText: 'Clear' }).click();
    await expect(t.panel.locator('#offices-done')).toHaveText('Done: All offices');
    // Find two offices by name and choose them.
    const search = t.panel.locator('#offices-search');
    await search.fill('Rajshahi PWD Division');
    const boxes = t.panel.locator('input[data-office]:visible');
    await expect(boxes.first()).toBeVisible();
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await t.panel.locator('#offices-done').click();
    await expect(field).toHaveText(/^2 offices/);
    await expect(t.panel.locator('#plan')).toContainText('Filters are ready.');
    // The page holds no single office while several are chosen.
    expect((await t.page.locator('#cmbOffice').inputValue()).trim()).toBe('');
    // A cluster's box chooses everything in it.
    await field.click();
    await t.panel.locator('[data-cluster="unplaced"]').check();
    await expect(t.panel.locator('#offices-done')).toHaveText(/^Done \(\d+\)$/);
    await t.panel.locator('#offices-close').click();

  } finally { await t.close(); }
});

test('the office hierarchy editor: drag, keyboard, undo, vanished offices, Excel out and in (D67)', async () => {
  test.setTimeout(120000);
  const t = await setup();
  try {
    await t.open('tender_info');
    await t.panel.locator('#warning-proceed').click();
    await t.panel.locator('#f-department-open').click();
    await t.panel.locator('.tree .node').first().click();
    await expect(t.panel.locator('[data-count="procuring_entity"]')).toHaveText(/^\d{2,} items$/);
    // e-GP stops listing one office that the hierarchy has.
    const tree = JSON.parse(await readFile(path.join(root, 'profiles/pwd-offices.json'), 'utf8'));
    const firstLinked = (nodes) => {
      for (const n of nodes) {
        if (n.egpId && n.level === 4) return n;
        const f = firstLinked(n.children);
        if (f) return f;
      }
      return null;
    };
    const vanished = firstLinked(tree.nodes);
    await t.page.evaluate((id) => [...document.getElementById('cmbOffice').options].find((o) => o.value === id).remove(), vanished.egpId);
    await t.panel.waitForTimeout(300); // the panel saves its state a moment after a change
    await t.panel.reload();
    await t.page.bringToFront();
    await expect(t.panel.locator('[data-filter]').first()).toBeVisible();

    await t.panel.locator('#settings').click();
    const unset = t.panel.locator('#editor-unset');
    await expect(unset.locator('h3')).toContainText('Not set (39)');
    // Gone from e-GP: hidden, with a switch to show it.
    await expect(t.panel.locator('#editor-gone')).toContainText('Show 1 office no longer on e-GP');
    await expect(t.panel.locator(`[data-node="${vanished.id}"]`)).toHaveCount(0);

    // Drag a Not set office onto a zone: it goes under it.
    const loose = unset.locator('.editor-row').first();
    const target = t.panel.locator('.editor-row[aria-level="2"]').first();
    await target.scrollIntoViewIfNeeded();
    await loose.dragTo(target);
    await expect(t.panel.locator('#editor-message')).toContainText('Placed');
    await expect(unset.locator('h3')).toContainText('Not set (38)');
    // The office the editor says it placed now sits under the zone, a level down.
    const placedName = /^Placed (.*) under /.exec(await t.panel.locator('#editor-message').textContent())[1];
    await expect(t.panel.locator('.editor-row[aria-level="3"]', { hasText: placedName })).toHaveCount(1);
    // Undo puts it back.
    await t.panel.locator('#editor-undo').click();
    await expect(unset.locator('h3')).toContainText('Not set (39)');
    // Keyboard: Alt and an arrow moves an office.
    const zone = t.panel.locator('.editor-row[aria-level="2"]').nth(1);
    const zoneId = await zone.getAttribute('data-node');
    await zone.focus();
    await t.panel.keyboard.press('Alt+ArrowUp');
    await expect(t.panel.locator('#editor-message')).toContainText('Moved');
    await expect(t.panel.locator('.editor-row[aria-level="2"]').first()).toHaveAttribute('data-node', zoneId);
    // Dragging a placed office onto Not set takes it out. Searching first brings it into view beside Not set.
    await t.panel.locator('#editor-search').fill('PWD Training Academy');
    const leaf = t.panel.locator('.editor-row[data-node]', { hasText: 'PWD Training Academy' }).first();
    await leaf.dragTo(unset.locator('h3'));
    await t.panel.locator('#editor-search').fill('');
    await expect(unset.locator('h3')).toContainText('Not set (40)');

    // Excel out: the template with its three sheets.
    await t.panel.evaluate(() => {
      // The panel saves through a link that carries the name (save-file.js).
      const real = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function click() {
        if (this.download) window.lastDownload = this.download;
        return real.call(this);
      };
    });
    await t.panel.locator('#editor-export').click();
    const worker = t.panel.context().serviceWorkers()[0];
    await expect.poll(() => worker.evaluate(async () => (await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 }))[0]?.state)).toBe('complete');
    const file = await worker.evaluate(async () => (await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 }))[0].filename);
    expect(await t.panel.evaluate(() => window.lastDownload)).toBe('PDMS_office_hierarchy.xls');
    const book = XLSX.read(await readFile(file), { type: 'buffer' });
    expect(book.SheetNames).toEqual(['How to fill', 'Office Hierarchy', 'e-GP offices']);
    const rows = XLSX.utils.sheet_to_json(book.Sheets['Office Hierarchy'], { header: 1 });
    expect(rows[0]).toEqual(['Level', 'Office', 'e-GP office ID', 'Name on e-GP', 'On e-GP now']);
    expect(rows.filter((r) => r[0] === 'Not set')).toHaveLength(40);

    // Excel in: a small hierarchy typed into the template replaces the tree; the rest of e-GP's offices are Not set.
    const live = XLSX.utils.sheet_to_json(book.Sheets['e-GP offices'], { header: 1 }).slice(1);
    const sheet = XLSX.utils.aoa_to_sheet([['Level', 'Office', 'e-GP office ID'], ['Chief Engineer', 'Chief Engineer'], ['Zone', 'Test Zone', String(live[0][0])], ['Circle', 'Test Circle', String(live[1][0])], ['Division', 'Test Division', String(live[2][0])]]);
    const out = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(out, sheet, 'Office Hierarchy');
    const upload = path.join(os.tmpdir(), `egp-import-${Date.now()}.xlsx`);
    await writeFile(upload, XLSX.write(out, { type: 'buffer', bookType: 'xlsx' }));
    t.panel.once('dialog', (d) => d.accept());
    await t.panel.locator('#editor-file').setInputFiles(upload);
    await expect(t.panel.locator('#editor-message')).toContainText('Imported');
    await t.panel.locator('#editor-search').fill('Test Division');
    await expect(t.panel.locator('.editor-row[aria-level="4"]')).toHaveText(/Test Division/);
    await t.panel.locator('#editor-search').fill('');
    await expect(unset.locator('h3')).toContainText(`Not set (${live.length - 3})`);

    // The office picker uses the new hierarchy.
    await t.panel.locator('#settings-close').click();
    await t.panel.locator('#f-procuring_entity').click();
    await expect(t.panel.locator('#sheet')).toContainText('Test Circle');
  } finally { await t.close(); }
});

test('a rebuilt but unreloaded extension: the panel says so and nothing can start (D71)', async () => {
  // Build A runs; build B's panel files are on disk. Simulated by giving the panel a different build stamp than the running background.
  const { cp } = await import('node:fs/promises');
  const ext = await mkdtemp(path.join(os.tmpdir(), 'egp-stale-'));
  await cp(dist, ext, { recursive: true });
  const panelFile = path.join(ext, 'panel', 'panel.js');
  await writeFile(panelFile, (await readFile(panelFile, 'utf8')).replace(/"\d{4}-\d{2}-\d{2}T[\d:.]+Z"/, '"2000-01-01T00:00:00.000Z"'));
  const portal = createMockPortal({ loggedIn: true });
  const mock = await portal.start();
  const dir = await mkdtemp(path.join(os.tmpdir(), 'egp-e2e-'));
  const context = await chromium.launchPersistentContext(dir, { channel: 'chromium', args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
  try {
    await context.route(/^https?:\/\//, async (route) => {
      const url = route.request().url();
      if (!url.startsWith(BASE)) return route.abort();
      const res = await fetch(mock + url.slice(BASE.length), { method: route.request().method(), headers: { 'Content-Type': route.request().headers()['content-type'] ?? 'text/plain' }, body: route.request().postData() ?? undefined });
      return route.fulfill({ status: res.status, contentType: res.headers.get('content-type') ?? 'text/html', body: await res.text() });
    });
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true }))[0].id);
    await page.goto(BASE + profile.flows.procurement_transaction_report.page.url);
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/panel/index.html?tab=${tabId}`);
    await expect(panel.locator('#stale-build')).toContainText('Reload needed');
    await expect(panel.locator('#start')).toHaveCSS('pointer-events', 'none');
    const opened = context.waitForEvent('page');
    await panel.locator('#reload-extension').click();
    expect((await opened).url()).toMatch(/^chrome:\/\/extensions\/\?id=/);
  } finally {
    await context.close();
    await portal.stop();
    await rm(dir, { recursive: true, force: true });
    await rm(ext, { recursive: true, force: true });
  }
});

