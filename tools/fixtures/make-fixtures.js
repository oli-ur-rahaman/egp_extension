// @ts-nocheck
// Builds tests/fixtures/ from the git-ignored recon/raw/ on this PC: cleans each page, records its fingerprint and expected state.
//   node tools/fixtures/make-fixtures.js
// The results are committed, so tests run on either PC.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { sanitise } from './sanitise.js';
import { fingerprint } from '../../src/shared/fingerprint.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const raw = path.join(root, 'recon', 'raw');
const out = path.join(root, 'tests', 'fixtures');
const dirs = readdirSync(raw);
const snapshot = (key) => {
  const d = dirs.find((x) => x.includes(key) && existsSync(path.join(raw, x, 'page.html')));
  if (!d) throw new Error(`No saved page for ${key}`);
  return readFileSync(path.join(raw, d, 'page.html'), 'utf8');
};
const captured = (name) => readFileSync(path.join(raw, 'fixtures', `${name}.html`), 'utf8');

// Every response body in the recordings, for the fragments that only exist there.
const responses = dirs.filter((d) => existsSync(path.join(raw, d, 'network.json'))).flatMap((d) => {
  const j = JSON.parse(readFileSync(path.join(raw, d, 'network.json'), 'utf8'));
  return (Array.isArray(j) ? j : j.requests || j.entries || []).map((e) => ({ url: String(e.url), post: String(e.postData || e.requestBody || ''), body: e.responseBody || e.body })).filter((e) => typeof e.body === 'string');
});
const response = (test, label) => {
  const found = responses.find(test);
  if (!found) throw new Error(`No recorded response for ${label}`);
  return found.body;
};
const listOf = (servlet) => response((e) => e.url.includes(servlet) && /<tr/i.test(e.body) && !/noRecordFound/.test(e.body), servlet);

const PAGES = [
  ['shared/home-logged-out', snapshot('p0.1-home-logged-out'), { kind: 'state', state: 'loggedOut' }],
  ['shared/account-prompt', snapshot('p0.2-post-login'), { kind: 'state', state: 'accountPrompt' }],
  ['shared/department-tree-popup', snapshot('p2.2-dept-tree-popup'), { kind: 'state', state: 'treePopup' }],

  ['flow1/filter', snapshot('p1.1-ptr-initial'), { flow: 'procurement_transaction_report', kind: 'filterPage', outcome: 'OK' }],
  ['flow1/report', snapshot('p1.4-ptr-results-nonempty'), { flow: 'procurement_transaction_report', kind: 'report', outcome: 'OK' }],

  ['flow2/filter', snapshot('p2.1-tender-initial'), { flow: 'tender_info', kind: 'filterPage', outcome: 'OK' }],
  ['flow2/filter-logged-in', snapshot('r7-p2-in'), { flow: 'tender_info', kind: 'filterPage', outcome: 'OK' }],
  ['flow2/notice-works', snapshot('p2.8-detail'), { flow: 'tender_info', kind: 'detail', outcome: 'OK', layout: 'tender' }],
  ['flow2/notice-reoi', snapshot('p2.9-detail-service'), { flow: 'tender_info', kind: 'detail', outcome: 'OK', layout: 'reoi' }],
  ...['goods', 'rfa', 'rfp', 'pps', 'amendment', 'cancelled'].map((n) => [`flow2/notice-${n}`, captured(`flow2/notice-${n}`), { flow: 'tender_info', kind: 'detail', outcome: 'OK', layout: n }]),
  ['flow2/notice-refused', captured('flow2/notice-refused'), { flow: 'tender_info', kind: 'detail', outcome: 'REFUSED', layout: 'refused', keepRefusal: true }],

  ['flow3/filter', snapshot('p3.1-app-home-pc'), { flow: 'app_info', kind: 'filterPage', outcome: 'OK' }],
  ['flow3/package-works', snapshot('r7-p3-detail'), { flow: 'app_info', kind: 'detail', outcome: 'OK', layout: 'works' }],
  ...['goods', 'rfq', 'services', 'physical', 'framework'].map((n) => [`flow3/package-${n}`, captured(`flow3/package-${n}`), { flow: 'app_info', kind: 'detail', outcome: 'OK', layout: n }]),

  ['flow4/filter', snapshot('p4.1-contract-initial'), { flow: 'contract_info', kind: 'filterPage', outcome: 'OK' }],
  ['flow4/contract-new', snapshot('p4.8-detail'), { flow: 'contract_info', kind: 'detail', outcome: 'OK', layout: 'new' }],
  ['flow4/contract-old', snapshot('r9-contract'), { flow: 'contract_info', kind: 'detail', outcome: 'OK', layout: 'old' }],
  ['flow4/contract-mixed', snapshot('r12-contract'), { flow: 'contract_info', kind: 'detail', outcome: 'OK', layout: 'mixed' }],

  ['flow5/filter', snapshot('p5.1-experience-initial'), { flow: 'experience_info', kind: 'filterPage', outcome: 'OK' }],
  ['flow5/experience-plain', snapshot('p5.8-detail'), { flow: 'experience_info', kind: 'detail', outcome: 'OK', layout: 'plain' }],
  ...['ownership', 'jvca'].map((n) => [`flow5/experience-${n}`, captured(`flow5/experience-${n}`), { flow: 'experience_info', kind: 'detail', outcome: 'OK', layout: n }]),
];
const FRAGMENTS = [
  ['flow2/list', listOf('TenderDetailsServlet'), { flow: 'tender_info', kind: 'list', outcome: 'OK' }],
  ['flow2/list-empty', captured('flow2/list-empty'), { flow: 'tender_info', kind: 'list', outcome: 'EMPTY' }],
  ['flow3/list', listOf('SearchServlet'), { flow: 'app_info', kind: 'list', outcome: 'OK' }],
  ['flow3/list-empty', captured('flow3/list-empty'), { flow: 'app_info', kind: 'list', outcome: 'EMPTY' }],
  ['flow4/list', listOf('AdvSearchNOAServlet'), { flow: 'contract_info', kind: 'list', outcome: 'OK' }],
  ['flow4/list-empty', captured('flow4/list-empty'), { flow: 'contract_info', kind: 'list', outcome: 'EMPTY' }],
  ['flow5/list', listOf('AdvSearcheCMSServlet'), { flow: 'experience_info', kind: 'list', outcome: 'OK' }],
  ['flow5/list-empty', captured('flow5/list-empty'), { flow: 'experience_info', kind: 'list', outcome: 'EMPTY' }],
  ['shared/office-combo', `<tr><td><select id="c">${captured('shared/office-combo')}</select></td></tr>`, { kind: 'lookup', state: 'officeCombo' }],
];

const manifest = {};
function save(name, html, meta, fragment) {
  let clean = sanitise(html, { fragment });
  // Some pages were saved after a department was chosen. A test page should open as a user's would: nothing chosen. A logged-in page's is fixed.
  if (meta.kind === 'filterPage' && !name.includes('logged-in')) {
    clean = clean.replace(/<input\b[^>]*\bid="txtdepartmentid"[^>]*>/, (tag) => tag.replace(/\bvalue="[^"]*"/, 'value=""'));
  }
  const file = path.join(out, `${name}.html`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, clean);
  const w = new Window();
  w.document.write(fragment ? `<table id="f"><tbody>${clean}</tbody></table>` : clean);
  manifest[name] = { ...meta, fragment: !!fragment, fingerprint: fingerprint(w.document.body), bytes: clean.length };
  w.close();
}
for (const [name, html, meta] of PAGES) save(name, html, meta, false);
for (const [name, html, meta] of FRAGMENTS) save(name, html, meta, true);

// The trees answer in JSON. They list public organisations and categories only; their names stay, so filters can be tested.
for (const name of ['shared/department-tree', 'shared/category-tree']) {
  const tree = captured(name);
  if (/[\w.+-]+@[\w-]+\.\w|\b01[3-9]\d{8}\b/.test(tree)) throw new Error(`${name} holds something like a contact detail.`);
  writeFileSync(path.join(out, `${name}.json`), `${JSON.stringify(JSON.parse(tree), null, 1)}\n`);
}

// No real all-zero report with all three tables has been captured, so this one is derived from the real report and marked so.
{
  const w = new Window();
  w.document.write(readFileSync(path.join(out, 'flow1/report.html'), 'utf8'));
  for (const table of w.document.querySelectorAll('#tab1, #tab2, #tab3')) {
    for (const cell of table.querySelectorAll('[id]')) cell.textContent = cell.tagName === 'LABEL' ? 'N.A.' : '0.000';
  }
  const derived = `<!doctype html>\n${w.document.documentElement.outerHTML}`;
  writeFileSync(path.join(out, 'flow1/report-empty.html'), derived);
  manifest['flow1/report-empty'] = { flow: 'procurement_transaction_report', kind: 'report', outcome: 'EMPTY', fragment: false, derived: true, fingerprint: fingerprint(w.document.body), bytes: derived.length };
  w.close();
}
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const total = Object.values(manifest).reduce((a, m) => a + m.bytes, 0);
console.log(`Wrote ${Object.keys(manifest).length} fixtures, ${Math.round(total / 1024)} KB.`);
