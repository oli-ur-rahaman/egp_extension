// @ts-nocheck
// Format study (docs/recon/r8-format-study.md): which factors change the detail-page layout on Flows 2-5?
// Read-only and logged out. One request at a time, paced, with hard stops. Stores labels, never values.
//
//   node tools/recon/study.js --state logged-out|logged-in [--department 21] [--limit 900] [--only 2,3,4,5] [--port 9222]
// Resumable: results append to recon/raw/study/<state>/samples.jsonl, and sampled strata are skipped on restart.
// Refuses to run if the page's login state doesn't match --state. See docs/recon/self-run-log.md.

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const STATE = arg('state', '');
if (!['logged-out', 'logged-in'].includes(STATE)) { console.error('--state logged-out or --state logged-in is required'); process.exit(1); }
const DEPT = String(arg('department', ''));
if (STATE === 'logged-in' && !DEPT) { console.error('A logged-in run needs --department with the account\'s own department'); process.exit(1); }
const outDir = path.join(root, 'recon', 'raw', 'study', STATE);
const samplesFile = path.join(outDir, 'samples.jsonl');
const doneFile = path.join(outDir, 'strata-done.jsonl');
const stopFile = path.join(outDir, 'stopped.txt');
const runFile = path.join(outDir, 'run.jsonl');

const LIMIT = Number(arg('limit', 900));
const ONLY = String(arg('only', '2,3,4,5')).split(',');
const PORT = Number(arg('port', 9222));
const ROWS_PER_LIST = 4;
const PACE_MS = 3000;
const SLOW_MS = 20000;
const BASE = 'https://www.eprocure.gov.bd';

const METHODS = [['1', 'RFQ'], ['2', 'OTM'], ['3', 'LTM'], ['5', 'TSTM'], ['6', 'QCBS'], ['7', 'LCS'], ['8', 'SFB'], ['9', 'DC'], ['10', 'SBCQ'], ['11', 'SSS'], ['12', 'IC'], ['13', 'CSO'], ['14', 'DPM'], ['15', 'OSTETM'], ['16', 'RFQU'], ['17', 'RFQL']];
const YEARS = [2011, 2013, 2015, 2017, 2019, 2021, 2023, 2024, 2025, 2026];
const NATURES = [['1', 'Goods'], ['2', 'Works'], ['3', 'Service'], ['4', 'Physical Services']];
const clean = (x) => String(x || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<br\s*\/?>/gi, ' / ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&amp;/g, ' ').replace(/\s+/g, ' ').trim();
const cellsOf = (tr) => [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => clean(m[1]));
const trs = (html) => [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
const totalPages = (html) => Number((html.match(/id="totalPages"[^>]*value="(\d+)"/) || [])[1] || 0);

// ---- Flow definitions: how to search, and how to read a row's link and attributes (labels only).
function flow2() {
  const body = (o) => ({ funName: 'AllTenders', departmentId: DEPT, viewType: 'AllTenders', office: '', procNature: '', budgetType: '', procType: '', procMethod: '0', tenderId: '', refNo: '', pubDtFrm: '', pubDtTo: '', closeDtFrm: '', closeDtTo: '', cpvCategory: '', isFrame: '0', pageNo: '1', size: '20', h: 't', ...o });
  const s = [];
  for (const v of ['Live', 'Archive', 'Cancel']) s.push([`status=${v}`, { viewType: v }]);
  for (const [v, n] of NATURES) s.push([`nature=${n}`, { procNature: v }]);
  for (const [v, n] of METHODS) s.push([`method=${n}`, { procMethod: v }]);
  for (const v of ['NCT', 'ICT']) s.push([`type=${v}`, { procType: v }]);
  for (const v of ['Development', 'Revenue', 'Own Fund']) s.push([`budget=${v}`, { budgetType: v }]);
  for (const [v, n] of [['1', 'Yes'], ['2', 'No']]) s.push([`framework=${n}`, { isFrame: v }]);
  for (const y of YEARS) s.push([`year=${y}`, { pubDtFrm: `01/01/${y}`, pubDtTo: `31/12/${y}` }]);
  for (const [v, n] of [['1', 'Goods'], ['2', 'Works'], ['4', 'Physical Services']]) for (const [mv, mn] of [['1', 'RFQ'], ['2', 'OTM'], ['5', 'TSTM'], ['14', 'DPM'], ['15', 'OSTETM']]) s.push([`nature=${n}+method=${mn}`, { procNature: v, procMethod: mv }]);
  for (const [mv, mn] of METHODS.filter(([, m]) => ['QCBS', 'LCS', 'SFB', 'DC', 'SBCQ', 'SSS', 'IC', 'CSO'].includes(m))) s.push([`nature=Service+method=${mn}`, { procNature: '3', procMethod: mv }]);
  return {
    id: '2', list: '/TenderDetailsServlet', strata: s.map(([k, o]) => [k, (page) => body({ ...o, pageNo: String(page) })]),
    rows: (html) => trs(html).filter((t) => /name="id" value="\d+"/.test(t)).map((t) => {
      const c = cellsOf(t);
      const id = t.match(/name="id" value="(\d+)"/)[1];
      return { key: id, open: { method: 'POST', url: '/resources/common/ViewTender.jsp', body: { id, h: 't' } }, attrs: { status: (c[1] || '').split(' / ').pop(), nature: (c[2] || '').split(',')[0].trim(), typeMethod: clean(c[4]).replace(/\s*\/\s*/g, ' '), year: ((c[5] || '').match(/-(\d{4})/) || [])[1] } };
    }),
  };
}
function flow3() {
  const body = (o) => ({ action: 'Search', departmentId: DEPT, office: ' ', project: ' ', financialYear: ' ', budgetType: '', procNature: '', procType: '', appId: '', appCode: '', pkgNo: '', operation: '', value: '', value2: '', pageNo: '1', size: '20', cpvCat: '', ...o });
  const s = [];
  for (const y of ['2026-2027', '2025-2026', '2024-2025', '2022-2023', '2020-2021', '2018-2019', '2016-2017', '2014-2015', '2012-2013', '2010-2011']) s.push([`fy=${y}`, { financialYear: y }]);
  for (const [, n] of NATURES) s.push([`nature=${n}`, { procNature: n }]);
  for (const v of ['NCT', 'ICT']) s.push([`type=${v}`, { procType: v }]);
  for (const [v, n] of [['1', 'Development'], ['2', 'Revenue'], ['3', 'Own fund']]) s.push([`budget=${n}`, { budgetType: v }]);
  return {
    id: '3', list: '/SearchServlet', strata: s.map(([k, o]) => [k, (page) => body({ ...o, pageNo: String(page) })]),
    rows: (html) => trs(html).map((t) => ({ t, href: (t.match(/href="([^"]*ViewPackageDetail[^"]*)"/) || [])[1] })).filter((x) => x.href).map(({ t, href }) => {
      const u = href.replace(/&amp;/g, '&');
      const c = cellsOf(t);
      return { key: (u.match(/pkgId=(\d+)/) || [])[1], open: { method: 'GET', url: u.startsWith('/') ? u : '/resources/common/' + u }, attrs: { pkgType: (u.match(/pkgType=([^&]+)/) || [])[1], nature: (c[4] || '').split(/[,/]/)[0].trim(), method: (c[6] || '').split(/[,/]/).pop().trim() } };
    }),
  };
}
function flow4() {
  const body = (o) => ({ keyword: '', officeId: ' ', contractAwardTo: '', noaDt: '', stateName: ' ', departmentId: DEPT, tenderId: '', contractNo: '', contractDtFrom: '', contractDtTo: '', tenderRefNo: '', contractAmount: '', advDt: '', procurementMethod: '', isFrame: '0', budgetType: '', pageNo: '1', size: '20', ...o });
  const s = [];
  for (const [v, n] of METHODS) s.push([`method=${n}`, { procurementMethod: v }]);
  for (const v of ['Development', 'Revenue', 'Own Fund']) s.push([`budget=${v}`, { budgetType: v }]);
  for (const [v, n] of [['1', 'Yes'], ['2', 'No']]) s.push([`framework=${n}`, { isFrame: v }]);
  for (const y of YEARS) s.push([`signYear=${y}`, { contractDtFrom: `01/01/${y}`, contractDtTo: `31/12/${y}` }]);
  for (const y of [2023, 2024, 2025]) for (const m of [1, 4, 7, 10]) s.push([`signQuarter=${y}-${m}`, { contractDtFrom: `02/${String(m).padStart(2, '0')}/${y}`, contractDtTo: `28/${String(m + 2).padStart(2, '0')}/${y}` }]);
  return {
    id: '4', list: '/AdvSearchNOAServlet', strata: s.map(([k, o]) => [k, (page) => body({ ...o, pageNo: String(page) })]),
    rows: (html) => trs(html).map((t) => ({ t, href: (t.match(/href="([^"]*ViewAwardedContracts[^"]*)"/) || [])[1] })).filter((x) => x.href).map(({ t, href }) => {
      const u = href.replace(/&amp;/g, '&');
      const c = cellsOf(t);
      return { key: (u.match(/pkgLotId=(\d+)/) || [])[1], open: { method: 'GET', url: u }, attrs: { method: (c[3] || '').split(' / ').pop().trim(), noaYear: ((c[5] || '').match(/(\d{4})/) || [])[1] } };
    }),
  };
}
function flow5() {
  const body = (o) => ({ action: 'geteCMSList', keyword: '', officeId: ' ', contractAwardTo: '', contractStartDtFrom: '', contractStartDtTo: '', contractEndDtFrom: '', contractEndDtTo: '', departmentId: DEPT, tenderId: '', procurementMethod: '', procurementNature: '', contAwrdSearchOpt: 'Contains', exCertSearchOpt: 'Contains', exCertificateNo: '', tendererId: '', procType: '', statusTab: 'All', pageNo: '1', size: '20', workStatus: 'All', ...o });
  const s = [];
  for (const tab of ['eTenders', 'eCMS', 'OffLine', 'All']) for (const w of ['All', 'Completed', 'Ongoing']) s.push([`tab=${tab}+work=${w}`, { statusTab: tab, workStatus: w }]);
  for (const n of ['Goods', 'Works', 'Service', 'Physical Services']) s.push([`nature=${n}`, { procurementNature: n }]);
  for (const m of ['RFQ', 'OTM', 'LTM', 'TSTM', 'DPM', 'OSTETM', 'RFQU', 'RFQL', 'QCBS', 'LCS', 'SFB', 'DC', 'SBCQ', 'SSS', 'IC', 'CSO']) s.push([`method=${m}`, { procurementMethod: m }]);
  for (const v of ['NCT', 'ICT']) s.push([`type=${v}`, { procType: v }]);
  for (const y of YEARS) s.push([`startYear=${y}`, { contractStartDtFrom: `${y}-01-01`, contractStartDtTo: `${y}-12-31` }]);
  return {
    id: '5', list: '/AdvSearcheCMSServlet', strata: s.map(([k, o]) => [k, (page) => body({ ...o, pageNo: String(page) })]),
    rows: (html) => trs(html).map((t) => ({ t, href: (t.match(/href="([^"]*VieweCmsDetails[^"]*)"/) || [])[1] })).filter((x) => x.href).map(({ t, href }) => {
      const u = href.replace(/&amp;/g, '&');
      const c = cellsOf(t);
      const nm = (c[2] || '').split(' / ').map((v) => v.replace(/,$/, '').trim());
      return { key: (u.match(/Id=(\d+)/) || [])[1], open: { method: 'GET', url: u }, attrs: { wcs: (u.match(/wcs=([^&]+)/) || [])[1], nature: nm[0], type: nm[1], method: nm[2], workStatus: c[9], startYear: ((c[8] || '').match(/(\d{4})/) || [])[1] } };
    }),
  };
}

// ---- Runs inside the page. Returns labels only, never values.
function readLabels(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const out = { title: doc.title, visible: [], hidden: [], tableHeaders: [], loginForm: !!doc.getElementById('txtPassword') };
  const isHidden = (el) => { for (let e = el; e && e.getAttribute; e = e.parentElement) { if (/display\s*:\s*none/i.test(e.getAttribute('style') || '')) return true; } return false; };
  for (const cell of doc.querySelectorAll('table td, table th')) {
    const t = text(cell);
    if (!t || t.length > 90 || cell.querySelector('table')) continue;
    const cls = cell.getAttribute('class') || '';
    if (cell.tagName === 'TH') { if (!out.tableHeaders.includes(t)) out.tableHeaders.push(t); continue; }
    if (/\bff\b/.test(cls) || /:\s*$/.test(t)) (isHidden(cell) ? out.hidden : out.visible).push(t.replace(/\s*:\s*$/, ''));
  }
  out.visible = [...new Set(out.visible)];
  out.hidden = [...new Set(out.hidden)];
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BLOCK = /captcha|access denied|too many requests|temporarily blocked|forbidden/i;

let used = 0;
async function stop(reason) {
  await appendFile(stopFile, `${new Date().toISOString()} ${reason}\n`);
  console.log('STOPPED:', reason);
  process.exit(2);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const seen = new Set();
  const doneStrata = new Set();
  if (existsSync(samplesFile)) for (const l of (await readFile(samplesFile, 'utf8')).split('\n')) if (l) seen.add(JSON.parse(l).flow + ':' + JSON.parse(l).key);
  if (existsSync(doneFile)) for (const l of (await readFile(doneFile, 'utf8')).split('\n')) if (l) doneStrata.add(JSON.parse(l).id);

  // A pending promise doesn't keep Node alive: without this, a dead link ends the process with exit code 0,
  // which looks like success. Now the only ways out are FINISHED or a stated stop reason.
  setInterval(() => {}, 60000);

  let tab = null;
  let cdp = null;
  let reconnects = 0;
  async function attach() {
    if (tab) await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`).catch(() => {});
    const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE + '/resources/common/AllTenders.jsp?h=t')}`, { method: 'PUT' });
    tab = await res.json();
    cdp = connect(tab.webSocketDebuggerUrl);
    await cdp.opened;
    await sleep(6000);
  }
  /** One CDP call with a time limit. A dead or stuck link rebuilds the tab, up to 5 times in a run. */
  async function send(method, params) {
    const attempt = () => Promise.race([
      cdp.send(method, params),
      cdp.closed.then((why) => { throw new Error('link closed: ' + why); }),
      sleep(45000).then(() => { throw new Error('no reply in 45 s'); }),
    ]);
    try {
      return await attempt();
    } catch (e) {
      console.log(`LINK PROBLEM at request ${used}: ${e.message}`);
      if (++reconnects > 5) await stop('link lost more than 5 times: ' + e.message);
      await attach();
  const probe = await send('Runtime.evaluate', { expression: "({ loginForm: !!document.getElementById('txtPassword'), logout: !!document.querySelector('a[href*=\"Logout\"]') })", returnByValue: true });
  const actual = probe.result.value.logout && !probe.result.value.loginForm ? 'logged-in' : 'logged-out';
  if (actual !== STATE) await stop(`page is ${actual} but --state says ${STATE}`);
  await appendFile(runFile, JSON.stringify({ started: new Date().toISOString(), state: STATE, department: DEPT, limit: LIMIT, only: ONLY }) + '\n');
      return attempt();
    }
  }
  await attach();
  const probe = await send('Runtime.evaluate', { expression: "({ loginForm: !!document.getElementById('txtPassword'), logout: !!document.querySelector('a[href*=\"Logout\"]') })", returnByValue: true });
  const actual = probe.result.value.logout && !probe.result.value.loginForm ? 'logged-in' : 'logged-out';
  if (actual !== STATE) await stop(`page is ${actual} but --state says ${STATE}`);
  await appendFile(runFile, JSON.stringify({ started: new Date().toISOString(), state: STATE, department: DEPT, limit: LIMIT, only: ONLY }) + '\n');

  let failures = 0;
  async function request(req) {
    if (used >= LIMIT) await stop(`request limit ${LIMIT} reached`);
    used++;
    await sleep(PACE_MS + Math.random() * 1500);
    const body = req.body ? new URLSearchParams(req.body).toString() : null;
    const t0 = Date.now();
    const expr = `(async () => { const r = await fetch(${JSON.stringify(req.url)}, { method: ${JSON.stringify(req.method)}, credentials: 'same-origin', ${body !== null ? `headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: ${JSON.stringify(body)},` : ''} }); return { status: r.status, url: r.url, text: await r.text() }; })()`;
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    const ms = Date.now() - t0;
    if (exceptionDetails || !result.value) { if (++failures >= 3) await stop('3 failures in a row: ' + (exceptionDetails && exceptionDetails.text)); return null; }
    const { status, text, url } = result.value;
    if (status >= 400) { if (status === 403 || status === 429) await stop(`HTTP ${status} on ${req.url}`); if (++failures >= 3) await stop(`3 failures in a row, last HTTP ${status}`); return null; }
    if (BLOCK.test(text.slice(0, 20000)) && !/captcha/i.test(req.url)) await stop(`block-like text on ${req.url}`);
    if (ms > SLOW_MS) await stop(`response took ${ms} ms on ${req.url}`);
    failures = 0;
    return { text, ms, url };
  }

  const flows = [flow2(), flow3(), flow4(), flow5()].filter((f) => ONLY.includes(f.id));
  for (const f of flows) {
    for (const [name, make] of f.strata) {
      const id = `${f.id}|${name}`;
      if (doneStrata.has(id)) continue;
      const first = await request({ method: 'POST', url: f.list, body: make(1) });
      if (!first) continue;
      const tp = totalPages(first.text) || (/noRecordFound/.test(first.text) ? 0 : 1);
      const lists = [[1, first.text]];
      if (tp > 2) {
        const mid = Math.ceil(tp / 2);
        const second = await request({ method: 'POST', url: f.list, body: make(mid) });
        if (second) lists.push([mid, second.text]);
      }
      let opened = 0;
      for (const [page, html] of lists) {
        const rows = f.rows(html).filter((r) => r.key);
        let n = 0;
        // Spread picks across the list, so a page full of near-identical rows doesn't dominate.
        const step = Math.max(1, Math.floor(rows.length / ROWS_PER_LIST));
        for (let i = 0; i < rows.length && n < ROWS_PER_LIST; i += step) {
          const r = rows[i];
          if (seen.has(f.id + ':' + r.key)) continue;
          seen.add(f.id + ':' + r.key);
          const got = await request(r.open);
          n++;
          if (!got) continue;
          const parsed = await send('Runtime.evaluate', { expression: `(${readLabels.toString()})(${JSON.stringify(got.text)})`, returnByValue: true });
          const labels = parsed.result.value;
          await appendFile(samplesFile, JSON.stringify({ flow: f.id, stratum: name, page, key: r.key, attrs: r.attrs, ms: got.ms, title: labels.title, visible: labels.visible, hidden: labels.hidden, tableHeaders: labels.tableHeaders }) + '\n');
          opened++;
        }
      }
      await appendFile(doneFile, JSON.stringify({ id, flow: f.id, stratum: name, totalPages: tp, opened }) + '\n');
      console.log(`${id}: pages ${tp}, opened ${opened}, requests so far ${used}`);
    }
  }
  console.log('FINISHED. Requests used:', used, '| link problems:', reconnects);
  await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`).catch(() => {});
  cdp.close();
  process.exit(0);
}

main().catch((e) => { console.error('STOPPED with an error:', e); process.exit(1); });
