// M2: says what state a page is in, so nothing is parsed from the wrong page. Holds no portal knowledge.
// Known layouts and unknown labels never count as a site change: only a lost identity or landmark does (BUILD_PLAN).

import { isVisible, readDetailLabels } from './page-read.js';

export const OUTCOME = Object.freeze({
  OK: 'OK',
  EMPTY: 'EMPTY',
  REFUSED: 'REFUSED',
  LOGIN_WALL: 'LOGIN_WALL',
  ACCOUNT_PROMPT: 'ACCOUNT_PROMPT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
  TIMEOUT: 'TIMEOUT',
  SHAPE_CHANGED: 'SHAPE_CHANGED',
});

/** Below this share of known labels, a detail page is no longer the page the profile describes. */
const MIN_KNOWN_SHARE = 0.5;

/**
 * @typedef {'filterPage' | 'list' | 'detail' | 'report'} PageKind
 * @typedef {{ outcome: string, reason: string, expected?: string, found?: string, unknownLabels?: string[] }} Verdict
 */

/** @param {string} outcome @param {string} reason @param {Partial<Verdict>} [extra] @returns {Verdict} */
const verdict = (outcome, reason, extra = {}) => ({ outcome, reason, ...extra });

/** @param {any} doc @param {any} profile @param {string} url @param {number} [status] @param {boolean} [isExpected] @returns {Verdict | null} */
function pageState(doc, profile, url, status, isExpected) {
  const states = profile.pageStates;
  if (status !== undefined && states.block.statuses.includes(status)) return verdict(OUTCOME.RATE_LIMITED, `The portal answered ${status}. Stop; don't retry.`);
  if (status !== undefined && status >= 500) return verdict(OUTCOME.SERVER_ERROR, `The portal answered ${status}.`);
  if (url.includes(states.sessionEnded.urlContains)) return verdict(OUTCOME.LOGIN_WALL, 'The session has ended.');
  if (url.includes(states.accountPrompt.urlContains) || doc.querySelector(states.accountPrompt.signature)) {
    return verdict(OUTCOME.ACCOUNT_PROMPT, "The portal is asking for account details. The tool never fills these; press Update Later.");
  }
  // A page that is plainly what was asked for isn't a block, even if a tender's own wording says "forbidden".
  if (isExpected) return null;
  // Only what a user can read (D41): the portal's own scripts mention "captcha" on ordinary pages.
  const text = (doc.body?.innerText ?? '').slice(0, 20000);
  if (new RegExp(states.block.textPattern, 'i').test(text)) return verdict(OUTCOME.RATE_LIMITED, 'The page reads like a block or CAPTCHA. Stop; don\'t retry.');
  return null;
}

/** @param {any} doc @param {any} flow */
function checkFilterPage(doc, flow) {
  const missing = flow.page.identity.filter((/** @type {string} */ s) => !doc.querySelector(s));
  if (doc.title.trim() !== flow.page.title) return verdict(OUTCOME.SHAPE_CHANGED, 'The page title has changed.', { expected: flow.page.title, found: doc.title.trim() });
  if (missing.length) return verdict(OUTCOME.SHAPE_CHANGED, 'Landmarks on the filter page are missing.', { expected: flow.page.identity.join(' '), found: `missing ${missing.join(' ')}` });
  return verdict(OUTCOME.OK, 'Filter page recognised.');
}

/** @param {any} doc @param {any} flow */
function checkList(doc, flow) {
  const list = flow.list;
  if (doc.querySelector(list.empty.selector)) return verdict(OUTCOME.EMPTY, 'No records for this search.');
  const rows = [...doc.querySelectorAll(list.rows)];
  const lastCell = Math.max(...list.columns.map((/** @type {any} */ c) => c.cell));
  // Header rows and the like have no data cells to compare, so count only rows with td cells.
  const dataRows = rows.filter((r) => r.querySelector(':scope > td'));
  if (!dataRows.length) return verdict(OUTCOME.SHAPE_CHANGED, 'The list returned no rows and no empty marker.', { expected: list.rows, found: 'nothing' });
  const short = dataRows.filter((r) => r.children.length < lastCell);
  if (short.length) return verdict(OUTCOME.SHAPE_CHANGED, 'List rows have fewer columns than expected.', { expected: `${lastCell} cells`, found: `${short[0].children.length} cells` });
  if (!doc.querySelector(list.totalPages)) return verdict(OUTCOME.SHAPE_CHANGED, 'The page count is missing.', { expected: list.totalPages, found: 'nothing' });
  return verdict(OUTCOME.OK, `${dataRows.length} rows.`);
}

/** @param {any} doc @param {any} flow */
function checkDetail(doc, flow) {
  const detail = flow.detail;
  const body = (doc.body?.textContent ?? '').replace(/\s+/g, ' ');
  if (detail.refusalText && body.includes(detail.refusalText)) return verdict(OUTCOME.REFUSED, 'The portal refused this record. Recorded on its row; the run continues.');
  if (doc.title.trim() !== detail.pageTitle) return verdict(OUTCOME.SHAPE_CHANGED, 'The page title has changed.', { expected: detail.pageTitle, found: doc.title.trim() });
  const labels = readDetailLabels(doc, flow);
  const recognised = labels.known.length + labels.ignored.length;
  const total = recognised + labels.unknown.length;
  if (total === 0 || labels.known.length === 0 || recognised / total < MIN_KNOWN_SHARE) {
    return verdict(OUTCOME.SHAPE_CHANGED, 'Too few labels on this page are known.', { expected: 'mostly known labels', found: `${recognised} known of ${total}`, unknownLabels: labels.unknown.slice(0, 20) });
  }
  return verdict(OUTCOME.OK, `${labels.known.length} known labels.`, labels.unknown.length ? { unknownLabels: labels.unknown } : {});
}

/** @param {any} doc @param {any} flow */
function checkReport(doc, flow) {
  const report = flow.report;
  const missing = report.tables.filter((/** @type {any} */ t) => !doc.querySelector(t.selector));
  if (missing.length) return verdict(OUTCOME.SHAPE_CHANGED, 'Report tables are missing.', { expected: report.tables.map((/** @type {any} */ t) => t.selector).join(' '), found: `missing ${missing.map((/** @type {any} */ t) => t.selector).join(' ')}` });
  // The server sends Total cells blank; the page's own script fills them later (live, D68). So rows decide, not totals.
  for (const table of report.tables) {
    const id = report.totalCell.replace('{table}', table.number).replace('{col}', '1');
    if (!doc.getElementById(id)) return verdict(OUTCOME.SHAPE_CHANGED, 'A total cell is missing.', { expected: id, found: 'nothing' });
  }
  // Empty is no rows, or rows that are all zeros (insight 24).
  const numberCols = report.columns.filter((/** @type {any} */ c) => c.type === 'number' || c.type === 'money').map((/** @type {any} */ c) => c.col);
  const cell = (/** @type {any} */ table, /** @type {any} */ col, /** @type {number} */ row) => doc.getElementById(report.cell.replace('{table}', table.number).replace('{col}', col).replace('{row}', String(row)));
  for (const table of report.tables) {
    for (let row = 1; cell(table, 2, row); row++) {
      if (numberCols.some((/** @type {any} */ col) => Number((cell(table, col, row)?.textContent ?? '').trim()) > 0)) return verdict(OUTCOME.OK, 'Report recognised.');
    }
  }
  return verdict(OUTCOME.EMPTY, 'The report has no figures.');
}

/**
 * Says what state a page is in.
 * @param {{ doc: any, profile: any, flow: any, kind: PageKind, url?: string, status?: number, timedOut?: boolean }} input
 * @returns {Verdict}
 */
export function classifyPage({ doc, profile, flow, kind, url = '', status, timedOut = false }) {
  if (timedOut) return verdict(OUTCOME.TIMEOUT, 'The page did not settle in time.');
  const isExpected = kind === 'list' ? !!(doc.querySelector(flow.list.empty.selector) || doc.querySelector(flow.list.totalPages))
    : kind === 'detail' ? doc.title.trim() === flow.detail.pageTitle
      : kind === 'report' ? flow.report.tables.some((/** @type {any} */ t) => doc.querySelector(t.selector)) : false;
  const state = pageState(doc, profile, url, status, isExpected);
  if (state) return state;
  if (flow.login.policy === 'required' && doc.querySelector(profile.pageStates.loginForm)) return verdict(OUTCOME.LOGIN_WALL, 'This flow needs a login.');
  if (kind === 'filterPage') return checkFilterPage(doc, flow);
  if (kind === 'list') return checkList(doc, flow);
  if (kind === 'detail') return checkDetail(doc, flow);
  return checkReport(doc, flow);
}

/**
 * M2-T02: resolves when the expected landmark is present and the page has stopped changing, or reports a timeout.
 * @param {{ root: Element | Document, ready: () => boolean, quietMs?: number, budgetMs?: number }} input
 * @returns {Promise<{ settled: boolean, elapsedMs: number }>}
 */
export function waitForSettle({ root, ready, quietMs = 300, budgetMs = 15000 }) {
  const started = Date.now();
  return new Promise((resolve) => {
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let quiet;
    /** @param {boolean} settled */
    const finish = (settled) => {
      observer.disconnect();
      clearTimeout(quiet);
      clearTimeout(budget);
      resolve({ settled, elapsedMs: Date.now() - started });
    };
    const arm = () => {
      clearTimeout(quiet);
      quiet = setTimeout(() => {
        if (ready()) finish(true);
      }, quietMs);
    };
    const observer = new MutationObserver(arm);
    observer.observe(root, { childList: true, subtree: true, attributes: true });
    const budget = setTimeout(() => finish(false), budgetMs);
    arm();
  });
}

export { isVisible };
