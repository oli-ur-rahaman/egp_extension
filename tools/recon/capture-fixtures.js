// @ts-nocheck
// Saves one real page per known layout into the git-ignored recon/raw/fixtures/, for tools/fixtures/make-fixtures.js to clean.
// Logged out and public only. One request at a time, about 5 s apart. Stops on a block page. Skips what's already saved.
//   node tools/recon/capture-fixtures.js [--port 9222]
// Needs the debug Chrome on a portal page (npm run chrome), logged out. Logged-in layouts are captured apart, with the owner.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, listPages } from './cdp.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.argv[process.argv.indexOf('--port') + 1]) || 9222;
const OUT = path.join(root, 'recon', 'raw', 'fixtures');
const MAX_REQUESTS = 40;
const BLOCK = /captcha|access denied|too many requests|temporarily blocked/i;

const readSamples = (run) => readFileSync(path.join(root, 'recon', 'raw', 'study', run, 'samples.jsonl'), 'utf8').trim().split('\n').map((l) => ({ ...JSON.parse(l), run }));
// Public runs only: a tender seen only when logged in stays out of a public repo.
const samples = [...readSamples('logged-out'), ...readSamples('logged-out-pwd')];
const has = (s, re) => [...s.visible, ...s.tableHeaders].some((l) => re.test(l.replace(/\s+/g, ' ')));

const WANTED = [
  ['flow2/notice-goods', '2', (s) => has(s, /Brief Description of Goods/) && !has(s, /Amendment/) && s.attrs.status !== 'Cancelled'],
  ['flow2/notice-rfa', '2', (s) => has(s, /^RFA No/)],
  ['flow2/notice-rfp', '2', (s) => has(s, /^RFP No/)],
  ['flow2/notice-pps', '2', (s) => has(s, /^PPS No/)],
  ['flow2/notice-amendment', '2', (s) => has(s, /Amendment \/ Corrigendum No/)],
  ['flow2/notice-cancelled', '2', (s) => s.attrs.status === 'Cancelled' && !has(s, /un-authorized/)],
  ['flow2/notice-refused', '2', (s) => has(s, /un-authorized/)],
  ['flow3/package-goods', '3', (s) => s.attrs.nature === 'Goods' && !has(s, /List of PE Offices/) && !has(s, /^RFQ Dates/)],
  ['flow3/package-rfq', '3', (s) => has(s, /^RFQ Dates/)],
  ['flow3/package-services', '3', (s) => has(s, /^REOI Dates/)],
  ['flow3/package-physical', '3', (s) => s.attrs.nature === 'Physical Services'],
  ['flow3/package-framework', '3', (s) => has(s, /List of PE Offices/)],
  ['flow5/experience-ownership', '5', (s) => has(s, /Beneficial/)],
  ['flow5/experience-jvca', '5', (s) => has(s, /Role In JVCA/)],
];

// Flow 3 links need the APP ID, which the samples don't keep, so re-read the list the sample came from.
const flow3Body = (s) => {
  const [k, v] = s.stratum.split('=');
  const o = { fy: { financialYear: v }, nature: { procNature: v }, type: { procType: v }, budget: { budgetType: { Development: '1', Revenue: '2', 'Own fund': '3' }[v] } }[k];
  return { action: 'Search', departmentId: s.run === 'logged-out-pwd' ? '21' : '', office: ' ', project: ' ', financialYear: ' ', budgetType: '', procNature: '', procType: '', appId: '', appCode: '', pkgNo: '', operation: '', value: '', value2: '', pageNo: String(s.page), size: '20', cpvCat: '', ...o };
};

const tab = (await listPages(PORT)).find((t) => /eprocure/.test(t.url));
if (!tab) { console.log('STOPPED: no portal tab in the debug Chrome. Run: npm run chrome'); process.exit(2); }
const cdp = connect(tab.webSocketDebuggerUrl);
await cdp.opened;
const evaluate = async (expression) => (await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

const loggedIn = await evaluate(`!!document.querySelector('a[href*="Logout"]') && !document.getElementById('txtPassword')`);
if (loggedIn) { console.log('STOPPED: the page is logged in. This tool captures public pages only.'); process.exit(2); }

let used = 0;
async function request(url, body) {
  if (used >= MAX_REQUESTS) { console.log(`STOPPED: request limit ${MAX_REQUESTS} reached`); process.exit(2); }
  used++;
  await new Promise((r) => setTimeout(r, 5000 + Math.random() * 1500));
  const init = body ? `{ method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: ${JSON.stringify(new URLSearchParams(body).toString())} }` : `{ credentials: 'same-origin' }`;
  const text = await evaluate(`fetch(${JSON.stringify(url)}, ${init}).then(async (r) => r.status + '\\n' + (await r.text()))`);
  if (typeof text !== 'string') { console.log('STOPPED: no reply from the page'); process.exit(2); }
  const status = Number(text.slice(0, 3));
  const html = text.slice(4);
  if (status === 403 || status === 429 || BLOCK.test(html.slice(0, 20000))) { console.log(`STOPPED: block-like reply on ${url}`); process.exit(2); }
  return status === 200 ? html : null;
}

async function fetchPage(flow, s) {
  if (flow === '2') return request('/resources/common/ViewTender.jsp', { id: s.key, h: 't' });
  if (flow === '5') return request(`/resources/common/VieweCmsDetails.jsp?wcs=${encodeURIComponent(s.attrs.wcs)}&Id=${s.key}`);
  const list = await request('/SearchServlet', flow3Body(s));
  const href = list && (list.match(new RegExp(`href=["']([^"']*ViewPackageDetail[^"']*pkgId=${s.key}[^"']*)["']`)) || [])[1];
  return href ? request('/resources/common/' + href.replace(/&amp;/g, '&')) : null;
}

let saved = 0, skipped = 0;
const missing = [];
for (const [name, flow, match] of WANTED) {
  const file = path.join(OUT, `${name}.html`);
  if (existsSync(file)) { skipped++; continue; }
  const candidates = samples.filter((s) => s.flow === flow && match(s)).slice(0, 3);
  let html = null;
  for (const s of candidates) {
    html = await fetchPage(flow, s);
    if (html) break;
  }
  if (!html) { missing.push(name); console.log(`not found: ${name}`); continue; }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, html);
  saved++;
  console.log(`saved ${name} (${Math.round(html.length / 1024)} KB), requests so far ${used}`);
}
// Empty results and the lookups behind the filters. The ID searched for doesn't exist.
const NO_SUCH_ID = '999999999';
const EXTRAS = [
  ['flow2/list-empty', '/TenderDetailsServlet', { funName: 'AllTenders', departmentId: '', viewType: 'AllTenders', office: '', procNature: '', budgetType: '', procType: '', procMethod: '0', tenderId: NO_SUCH_ID, refNo: '', pubDtFrm: '', pubDtTo: '', closeDtFrm: '', closeDtTo: '', cpvCategory: '', isFrame: '0', pageNo: '1', size: '10', h: 't' }],
  ['flow3/list-empty', '/SearchServlet', { action: 'Search', departmentId: '', office: ' ', project: ' ', financialYear: ' ', budgetType: '', procNature: '', procType: '', appId: NO_SUCH_ID, appCode: '', pkgNo: '', operation: '', value: '', value2: '', pageNo: '1', size: '10', cpvCat: '' }],
  ['flow4/list-empty', '/AdvSearchNOAServlet', { keyword: '', officeId: ' ', contractAwardTo: '', noaDt: '', stateName: ' ', departmentId: '', tenderId: NO_SUCH_ID, contractNo: '', contractDtFrom: '', contractDtTo: '', tenderRefNo: '', contractAmount: '', advDt: '', procurementMethod: '', isFrame: '0', budgetType: '', pageNo: '1', size: '10' }],
  ['flow5/list-empty', '/AdvSearcheCMSServlet', { action: 'geteCMSList', keyword: '', officeId: ' ', contractAwardTo: '', contractStartDtFrom: '', contractStartDtTo: '', contractEndDtFrom: '', contractEndDtTo: '', departmentId: '', tenderId: NO_SUCH_ID, procurementMethod: '', procurementNature: '', contAwrdSearchOpt: 'Contains', exCertSearchOpt: 'Contains', exCertificateNo: '', tendererId: '', procType: '', statusTab: 'eTenders', pageNo: '1', size: '10', workStatus: 'All' }],
  ['shared/office-combo', '/ComboServlet', { departmentId: '21', funName: 'officeCombo' }],
  ['shared/department-tree', '/getDataForTree?id=0&showPrNd=false', null],
  ['shared/category-tree', '/GetCpvTree?id=0&searchBy=&action=&keyword=', null],
];
for (const [name, url, body] of EXTRAS) {
  const file = path.join(OUT, `${name}.html`);
  if (existsSync(file)) { skipped++; continue; }
  const html = await request(url, body);
  if (!html) { missing.push(name); console.log(`not found: ${name}`); continue; }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, html);
  saved++;
  console.log(`saved ${name} (${Math.round(html.length / 1024)} KB), requests so far ${used}`);
}
cdp.close();
console.log(`FINISHED. Saved ${saved}, already had ${skipped}, not found ${missing.length}${missing.length ? ': ' + missing.join(', ') : ''}. Requests: ${used}.`);
process.exit(0);
