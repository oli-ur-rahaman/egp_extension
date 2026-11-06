// M1-T08: a fake e-GP portal for building and testing. Replays the cleaned pages in tests/fixtures/, with sizes and faults on demand.
// Never touches the real portal. Filters other than an ID search aren't simulated: results depend on page, size and the faults set.
//   node tests/mock-server/server.js [--port 8099]

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtures = path.join(root, 'tests', 'fixtures');
const read = (name) => readFileSync(path.join(fixtures, `${name}.html`), 'utf8');
const profile = JSON.parse(readFileSync(path.join(root, 'profiles', 'eprocure.gov.bd.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(fixtures, 'manifest.json'), 'utf8'));

const SESSION_ENDED_PAGE = '<!doctype html><html><head><title>Session Timed Out</title></head><body><p>Your session has timed out.</p></body></html>';
const BLOCK_PAGE = '<!doctype html><html><head><title>Verification</title></head><body><p>Please complete the captcha to continue.</p></body></html>';

// How each list's rows carry their IDs, and which request field opens a detail page.
const FLOWS = {
  tender_info: { prefix: 'flow2', idField: 'id', searchField: 'tenderId', rowIds: [/name="id" value="(\d+)"/] },
  app_info: { prefix: 'flow3', idField: 'pkgId', searchField: 'appId', rowIds: [/pkgId=(\d+)/, /appId=(\d+)/] },
  contract_info: { prefix: 'flow4', idField: 'pkgLotId', searchField: 'tenderId', rowIds: [/pkgLotId=(\d+)/, /tenderid=(\d+)/] },
  experience_info: { prefix: 'flow5', idField: 'Id', searchField: 'tenderId', rowIds: [/[?&;]Id=(\d+)/] },
};

function loadRows(prefix) {
  const window = new Window();
  window.document.write(`<table id="f"><tbody>${read(`${prefix}/list`)}</tbody></table>`);
  const direct = [...window.document.querySelectorAll('#f > tbody > tr')];
  const header = direct.find((r) => r.querySelector(':scope > th'))?.outerHTML ?? '';
  const rows = direct.filter((r) => r.querySelector(':scope > td')).map((r) => r.outerHTML);
  window.close();
  return { header, rows };
}

/** Clones the real rows to the size asked for, giving each its own IDs. */
function buildRows(flowId, wanted) {
  const { prefix, rowIds } = FLOWS[flowId];
  const { header, rows } = loadRows(prefix);
  const out = [];
  for (let i = 0; i < wanted; i++) {
    let row = rows[i % rows.length];
    const newId = String(5000000 + i);
    const ids = rowIds.map((re) => (row.match(re) || [])[1]).filter(Boolean);
    for (const id of new Set(ids)) row = row.split(id).join(newId);
    out.push({ id: newId, html: row });
  }
  return { header, rows: out };
}

function layoutsOf(flowId) {
  return Object.entries(manifest).filter(([, m]) => m.flow === flowId && m.kind === 'detail').map(([name]) => name);
}

const htmlOf = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  res.end(body);
};

/**
 * @param {{ rows?: Record<string, number>, loggedIn?: boolean, latencyMs?: number }} [options]
 */
export function createMockPortal({ rows = {}, loggedIn = false, latencyMs = 0 } = {}) {
  const data = Object.fromEntries(Object.keys(FLOWS).map((id) => [id, buildRows(id, rows[id] ?? 250)]));
  const state = { loggedIn, latencyMs, requests: [], faults: {} };
  const pageRoutes = new Map(Object.entries(profile.flows).map(([id, f]) => [new URL(f.page.url, 'http://x').pathname, id]));
  const listRoutes = new Map(Object.keys(FLOWS).map((id) => [profile.flows[id].list.request.url, id]));
  const detailRoutes = new Map(Object.keys(FLOWS).map((id) => [profile.flows[id].detail.open.url, id]));

  function listAnswer(flowId, form) {
    const { prefix, searchField } = FLOWS[flowId];
    const { header, rows: all } = data[flowId];
    const search = form.get(searchField);
    const matches = search && search.trim() ? all.filter((r) => r.id === search.trim()) : all;
    if (!matches.length) return read(`${prefix}/list-empty`);
    const size = Number(form.get('size')) || 10;
    const page = Number(form.get('pageNo')) || 1;
    let order = matches;
    if (state.faults.unstableOrder && page % 2 === 1 && page * size < matches.length) {
      // Tied rows fall differently on odd pages: one row is seen twice, and its neighbour never (E8).
      order = [...matches];
      [order[page * size - 1], order[page * size]] = [order[page * size], order[page * size - 1]];
    }
    const slice = order.slice((page - 1) * size, page * size);
    const counts = `<input type="hidden" id="totalPages" value="${Math.ceil(matches.length / size)}"><input type="hidden" id="cntTenBrief" value="${slice.length}">`;
    return header + slice.map((r) => r.html).join('') + counts;
  }

  function detailAnswer(flowId, id) {
    const layouts = layoutsOf(flowId);
    const index = data[flowId].rows.findIndex((r) => r.id === id);
    return read(layouts[(index < 0 ? 0 : index) % layouts.length]);
  }

  function respond(req, res, body) {
    const url = new URL(req.url, 'http://mock');
    const form = new URLSearchParams(body);
    const faults = state.faults;
    state.requests.push({ method: req.method, path: url.pathname, at: Date.now() });

    if (faults.drop) return req.socket.destroy();
    if (faults.blockAfter !== undefined && state.requests.length > faults.blockAfter) return htmlOf(res, 200, BLOCK_PAGE);
    if (faults.block) return htmlOf(res, 200, BLOCK_PAGE);
    if (faults.failNext?.length) return htmlOf(res, faults.failNext.shift(), `<html><head><title>Error</title></head><body>Error</body></html>`);

    const flowOfPage = pageRoutes.get(url.pathname);
    if (url.pathname === '/resources/common/SessionTimedOut.jsp') return htmlOf(res, 200, SESSION_ENDED_PAGE);
    if (url.pathname === '/UpdateMobileNid.jsp') return htmlOf(res, 200, read('shared/account-prompt'));
    if (url.pathname === '/' || url.pathname === '/Index.jsp') return htmlOf(res, 200, read('shared/home-logged-out'));

    if (flowOfPage === 'procurement_transaction_report') {
      if (faults.sessionEnded) { state.loggedIn = false; return htmlOf(res, 302, '', { Location: '/resources/common/SessionTimedOut.jsp' }); }
      if (!state.loggedIn) return htmlOf(res, 200, read('shared/home-logged-out'));
      if (req.method === 'GET') return htmlOf(res, 200, read('flow1/filter'));
      return htmlOf(res, 200, read(form.get('offId') === 'empty' ? 'flow1/report-empty' : 'flow1/report'));
    }
    if (flowOfPage) {
      const prefix = FLOWS[flowOfPage].prefix;
      return htmlOf(res, 200, read(flowOfPage === 'tender_info' && state.loggedIn ? `${prefix}/filter-logged-in` : `${prefix}/filter`));
    }
    const listFlow = listRoutes.get(url.pathname);
    if (listFlow) return htmlOf(res, 200, listAnswer(listFlow, form));
    const detailFlow = detailRoutes.get(url.pathname);
    if (detailFlow) {
      const field = FLOWS[detailFlow].idField;
      return htmlOf(res, 200, detailAnswer(detailFlow, form.get(field) ?? url.searchParams.get(field)));
    }
    if (url.pathname === profile.sharedSources.officeCombo.url && form.get('funName') === 'officeCombo') {
      const window = new Window();
      window.document.write(read('shared/office-combo'));
      const options = window.document.querySelector('select')?.innerHTML ?? '';
      window.close();
      return htmlOf(res, 200, options);
    }
    if (url.pathname === profile.sharedSources.departmentTree.url) return htmlOf(res, 200, readFileSync(path.join(fixtures, 'shared/department-tree.json'), 'utf8'), { 'Content-Type': 'application/json' });
    if (url.pathname === profile.sharedSources.categoryTree.url) {
      if (url.searchParams.get('action') === 'getChildData') return htmlOf(res, 200, url.searchParams.get('cpvdesc') ?? '');
      return htmlOf(res, 200, readFileSync(path.join(fixtures, 'shared/category-tree.json'), 'utf8'), { 'Content-Type': 'application/json' });
    }
    return htmlOf(res, 404, 'Not found');
  }

  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => setTimeout(() => respond(req, res, body), state.latencyMs));
  });

  return {
    state,
    /** @param {Record<string, any>} faults unstableOrder, block, blockAfter, failNext: [status], drop, sessionEnded */
    setFaults(faults) { state.faults = faults; },
    /** @param {boolean} value */
    setLoggedIn(value) { state.loggedIn = value; },
    /** Row IDs held for a flow, so a test can check for losses. */
    rowIds: (flowId) => data[flowId].rows.map((r) => r.id),
    /** @param {number} [port] */
    start: (port = 0) => new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))),
    stop: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--port');
  const portal = createMockPortal({ loggedIn: process.argv.includes('--logged-in') });
  const url = await portal.start(i > 0 ? Number(process.argv[i + 1]) : 8099);
  console.log(`Fake e-GP portal at ${url}`);
}
