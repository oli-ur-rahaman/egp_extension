// M1-AT2: the fake portal serves every saved page and behaves like the real one, faults included.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';
import { createMockPortal } from '../mock-server/server.js';
import { classifyPage, OUTCOME } from '../../src/shared/sentinel.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const profile = JSON.parse(readFileSync(path.join(root, 'profiles/eprocure.gov.bd.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/manifest.json'), 'utf8'));
const portal = createMockPortal({ rows: { tender_info: 250, app_info: 30, contract_info: 30, experience_info: 30 } });
let base;
beforeAll(async () => { base = await portal.start(); });
afterAll(() => portal.stop());

const post = (url, fields) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
const docOf = (html, fragment) => { const w = new Window(); w.document.write(fragment ? `<html><head><title></title></head><body><table id="resultTable"><tbody>${html}</tbody></table></body></html>` : html); return w.document; };
const FLOWS = ['tender_info', 'app_info', 'contract_info', 'experience_info'];
const listUrl = (id) => profile.flows[id].list.request.url;

describe('pages', () => {
  it('serves each filter page in its proper state', async () => {
    for (const id of FLOWS) {
      const res = await fetch(base + profile.flows[id].page.url);
      const got = classifyPage({ doc: docOf(await res.text()), profile, flow: profile.flows[id], kind: 'filterPage' });
      expect(got.outcome, id).toBe(OUTCOME.OK);
    }
  });
  it('gives Flow 1 a login wall when logged out, and the report when logged in', async () => {
    const flow = profile.flows.procurement_transaction_report;
    const url = flow.page.url;
    portal.setLoggedIn(false);
    expect(classifyPage({ doc: docOf(await (await fetch(base + url)).text()), profile, flow, kind: 'filterPage' }).outcome).toBe(OUTCOME.LOGIN_WALL);
    portal.setLoggedIn(true);
    expect(classifyPage({ doc: docOf(await (await fetch(base + url)).text()), profile, flow, kind: 'filterPage' }).outcome).toBe(OUTCOME.OK);
    expect(classifyPage({ doc: docOf(await (await post(url, { offId: '1' })).text()), profile, flow, kind: 'report' }).outcome).toBe(OUTCOME.OK);
    expect(classifyPage({ doc: docOf(await (await post(url, { offId: 'empty' })).text()), profile, flow, kind: 'report' }).outcome).toBe(OUTCOME.EMPTY);
    portal.setLoggedIn(false);
  });
  it('shows the logged-in Flow 2 page when logged in', async () => {
    portal.setLoggedIn(true);
    const doc = docOf(await (await fetch(base + profile.flows.tender_info.page.url)).text());
    expect(doc.querySelector(profile.pageStates.logoutLink)).not.toBeNull();
    portal.setLoggedIn(false);
  });
  it('answers the filter lookups', async () => {
    expect(await (await post('/ComboServlet', { departmentId: '21', funName: 'officeCombo' })).text()).toContain('<option');
    expect(await (await fetch(`${base}/getDataForTree?id=0&showPrNd=false`)).text()).toContain('deptid_');
  });
});

describe('lists', () => {
  for (const id of FLOWS) {
    it(`${id}: pages and sizes add up, with the page count in the answer`, async () => {
      const total = portal.rowIds(id).length;
      const doc = docOf(await (await post(listUrl(id), { pageNo: '1', size: '10' })).text(), true);
      expect(doc.querySelector('#totalPages').getAttribute('value')).toBe(String(Math.ceil(total / 10)));
      expect(classifyPage({ doc, profile, flow: profile.flows[id], kind: 'list' }).outcome).toBe(OUTCOME.OK);
    });
    it(`${id}: an ID that doesn't exist comes back empty`, async () => {
      const field = id === 'app_info' ? 'appId' : 'tenderId';
      const doc = docOf(await (await post(listUrl(id), { pageNo: '1', size: '10', [field]: '999999999' })).text(), true);
      expect(classifyPage({ doc, profile, flow: profile.flows[id], kind: 'list' }).outcome).toBe(OUTCOME.EMPTY);
    });
  }
  it('size 100 gives 100 rows and fewer pages', async () => {
    const doc = docOf(await (await post(listUrl('tender_info'), { pageNo: '1', size: '100' })).text(), true);
    expect(doc.querySelector('#totalPages').getAttribute('value')).toBe('3');
    expect(doc.querySelector('#cntTenBrief').getAttribute('value')).toBe('100');
  });
  it('rows keep their own IDs across clones', async () => {
    const html = await (await post(listUrl('tender_info'), { pageNo: '1', size: '100' })).text();
    const ids = [...html.matchAll(/name="id" value="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(100);
  });
  it('a sweep with no fault finds every row', async () => {
    const seen = new Set();
    for (let page = 1; page <= 3; page++) {
      const html = await (await post(listUrl('tender_info'), { pageNo: String(page), size: '100' })).text();
      for (const m of html.matchAll(/name="id" value="(\d+)"/g)) seen.add(m[1]);
    }
    expect(seen.size).toBe(250);
  });
  it('with tied timestamps a sweep loses rows, as on the real portal (E8)', async () => {
    portal.setFaults({ unstableOrder: true });
    const seen = new Set();
    let returned = 0;
    for (let page = 1; page <= 3; page++) {
      const html = await (await post(listUrl('tender_info'), { pageNo: String(page), size: '100' })).text();
      for (const m of html.matchAll(/name="id" value="(\d+)"/g)) { seen.add(m[1]); returned++; }
    }
    portal.setFaults({});
    expect(returned).toBe(250);
    expect(seen.size).toBeLessThan(250);
  });
});

describe('detail pages', () => {
  it('serves every layout of every flow', async () => {
    for (const id of FLOWS) {
      const layouts = new Set();
      const flow = profile.flows[id];
      const want = Object.values(manifest).filter((m) => m.flow === id && m.kind === 'detail').length;
      const ids = portal.rowIds(id).slice(0, want);
      for (const rowId of ids) {
        const res = id === 'tender_info'
          ? await post(flow.detail.open.url, { id: rowId, h: 't' })
          : await fetch(`${base}${flow.detail.open.url}?${id === 'app_info' ? 'pkgId' : id === 'contract_info' ? 'pkgLotId' : 'Id'}=${rowId}`);
        const html = await res.text();
        const got = classifyPage({ doc: docOf(html), profile, flow, kind: 'detail' });
        expect([OUTCOME.OK, OUTCOME.REFUSED], rowId).toContain(got.outcome);
        layouts.add(html.length);
      }
      expect(layouts.size, id).toBe(want);
    }
  });
});

describe('faults', () => {
  it('a 500 for the next request only', async () => {
    portal.setFaults({ failNext: [503] });
    expect((await fetch(base + '/')).status).toBe(503);
    expect((await fetch(base + '/')).status).toBe(200);
    portal.setFaults({});
  });
  it('a CAPTCHA page reads as a stop', async () => {
    portal.setFaults({ block: true });
    const got = classifyPage({ doc: docOf(await (await fetch(base + '/')).text()), profile, flow: profile.flows.tender_info, kind: 'list' });
    portal.setFaults({});
    expect(got.outcome).toBe(OUTCOME.RATE_LIMITED);
  });
  it('a block that starts partway through a run', async () => {
    const before = portal.state.requests.length;
    portal.setFaults({ blockAfter: before + 1 });
    expect(await (await fetch(base + '/')).text()).not.toContain('captcha');
    expect(await (await fetch(base + '/')).text()).toContain('captcha');
    portal.setFaults({});
  });
  it('a dropped connection', async () => {
    portal.setFaults({ drop: true });
    await expect(fetch(base + '/')).rejects.toThrow();
    portal.setFaults({});
  });
  it('a session ending redirects to the timeout page', async () => {
    portal.setLoggedIn(true);
    portal.setFaults({ sessionEnded: true });
    const res = await fetch(base + profile.flows.procurement_transaction_report.page.url);
    portal.setFaults({});
    expect(res.url).toContain('SessionTimedOut.jsp');
    expect(classifyPage({ doc: docOf(await res.text()), profile, flow: profile.flows.procurement_transaction_report, kind: 'report', url: res.url }).outcome).toBe(OUTCOME.LOGIN_WALL);
  });
  it('latency is honoured, and requests are logged', async () => {
    const slow = createMockPortal({ rows: { tender_info: 1, app_info: 1, contract_info: 1, experience_info: 1 }, latencyMs: 60 });
    const url = await slow.start();
    const t0 = Date.now();
    await fetch(url + '/');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(50);
    expect(slow.state.requests).toHaveLength(1);
    await slow.stop();
  });
});
