// M1-AT3 (nothing personal survives cleaning), M1-AT5 (profile selectors resolve on saved pages), M2-AT1-3 (page states), M1-T10 (fingerprints).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';
import { maskText, sanitise } from '../../tools/fixtures/sanitise.js';
import { classifyPage, OUTCOME, waitForSettle } from '../../src/shared/sentinel.js';
import { isVisible, readDetailLabels } from '../../src/shared/page-read.js';
import { fingerprint } from '../../src/shared/fingerprint.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/manifest.json'), 'utf8'));
const profile = JSON.parse(readFileSync(path.join(root, 'profiles/eprocure.gov.bd.json'), 'utf8'));
const entries = Object.entries(manifest);
const raw = (name) => readFileSync(path.join(root, 'tests/fixtures', `${name}.html`), 'utf8');

// Lists come back as bare rows; the real page holds them in its results table.
function load(name) {
  const window = new Window();
  const html = raw(name);
  window.document.write(manifest[name].fragment ? `<!doctype html><html><head><title></title></head><body><table id="resultTable"><tbody>${html}</tbody></table></body></html>` : html);
  return window.document;
}
const textOf = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('cleaning (M1-AT3)', () => {
  const PLANTED = `<!doctype html><html><head><title>T</title>
    <meta name="author" content="Rahim Uddin">
    <script>var officer = "Rahim Uddin"; var token = "tok-secret-123";</script>
    <!-- Rahim Uddin, rahim@example.gov.bd -->
    <style>.x { content: "Rahim Uddin"; }</style></head><body>
    <table class="formStyle_1"><tr><td class="ff">Name of Official Inviting :</td><td>Rahim Uddin</td></tr>
    <tr><td class="ff">Contact :</td><td>Phone: 02-9129231, 01711223344, rahim@example.gov.bd</td></tr>
    <tr><td class="ff">Status :</td><td>Live</td></tr><tr><td class="ff">Date :</td><td>26-Feb-2026 09:00</td></tr>
    <tr><td class="ff">Price :</td><td>12000</td></tr></table>
    <a href="/admin/ViewProfile.jsp?uid=778899" title="Rahim Uddin" onclick="go('Rahim Uddin')">x</a>
    <input type="hidden" name="userId" value="778899"><input type="text" name="q" value="Rahim Uddin">
    <input type="hidden" name="sessionToken" value="tok-secret-123">
    <img alt="Rahim Uddin" src="/a.png">
    </body></html>`;
  const clean = sanitise(PLANTED);

  it('removes planted names, emails, phones, tokens and account IDs from everywhere', () => {
    for (const secret of ['Rahim', 'Uddin', 'rahim@', 'example.gov', '9129231', '01711223344', 'tok-secret', '778899']) {
      expect(clean, secret).not.toContain(secret);
    }
  });
  it('removes scripts, comments and event handlers', () => {
    expect(clean).not.toMatch(/<script|<!--|onclick/);
  });
  it('keeps labels, standard terms, dates and plain numbers', () => {
    for (const kept of ['Name of Official Inviting :', 'Live', '26-Feb-2026 09:00', '12000']) expect(clean).toContain(kept);
  });
  it('keeps a value\'s shape, so parsers have something real to split', () => {
    expect(maskText('Mohd. Ali, Dhaka-1208')).toBe('Xxxx. Xxx, Xxxxx-9999');
  });
  it('refuses to output anything that still looks like an email or phone', () => {
    expect(() => sanitise('<html><body><td class="ff">x@y.org:</td></body></html>')).not.toThrow();
    expect(sanitise('<html><body><td class="ff">x@y.org:</td></body></html>')).not.toContain('x@y.org');
  });
  it('keeps what a hidden section has hidden', () => {
    expect(sanitise('<html><body><table style="display: none;"><tr><th>Query</th></tr></table></body></html>')).toContain('display: none');
  });
});

describe('the saved pages hold nothing personal', () => {
  const PERSONAL = /^(Name of Official Inviting|Contact details of Official|Address of Official|Name of Authorised Officer|Procuring Entity$|PE Name|Company Name|Name of the Economic Operator|Name of Supplier|Business Address)/;
  for (const [name, m] of entries.filter(([, x]) => x.kind === 'detail')) {
    it(name, () => {
      const doc = load(name);
      for (const cell of doc.querySelectorAll('td.ff')) {
        if (!PERSONAL.test(textOf(cell))) continue;
        const copy = cell.nextElementSibling.cloneNode(true);
        // Inner captions such as Phone No and City are labels; only the values must be masked.
        for (const caption of copy.querySelectorAll('b')) caption.remove();
        const value = textOf(copy);
        expect(value, textOf(cell)).not.toMatch(/[a-wyz]|[A-WYZ]/);
      }
      expect(m.bytes).toBeGreaterThan(0);
    });
  }
  it('list rows mask contractor names', () => {
    const cases = [['flow4/list', 6], ['flow5/list', 4]];
    for (const [name, cell] of cases) {
      const rows = [...load(name).querySelectorAll('#resultTable > tbody > tr')].filter((r) => r.querySelector(':scope > td'));
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(textOf(r.children[cell])).not.toMatch(/[a-wyz]|[A-WYZ]/);
    }
  });
  it('every page and fragment: no link keeps an ID, except links to the four record pages', () => {
    for (const [name] of entries) {
      for (const m of raw(name).matchAll(/href="([^"]*\?[^"]*)"/g)) {
        if (/(ViewTender|ViewPackageDetail|ViewAwardedContracts|VieweCmsDetails)\.jsp/.test(m[1])) continue;
        expect(m[1].replace(/&amp;/g, '&'), name).not.toMatch(/=[^&]/);
      }
    }
  });
  it('every page and fragment: no emails or phone numbers', () => {
    for (const [name] of entries) {
      const html = raw(name);
      expect(html, name).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      expect(html, name).not.toMatch(/\b01[3-9]\d{8}\b/);
    }
  });
});

describe('every profile selector resolves on a saved page (M1-AT5)', () => {
  for (const [name, m] of entries.filter(([, x]) => x.kind === 'filterPage')) {
    it(name, () => {
      const doc = load(name);
      const flow = profile.flows[m.flow];
      const selectors = [...flow.page.identity, ...flow.filters.flatMap((f) => [f.selector, f.valueSelector, ...(f.parts ?? []).map((p) => p.selector)])].filter(Boolean);
      expect(selectors.filter((s) => !doc.querySelector(s))).toEqual([]);
    });
  }
  it('the login and account signatures match their pages', () => {
    expect(load('shared/home-logged-out').querySelector(profile.pageStates.loginForm)).not.toBeNull();
    expect(load('shared/home-logged-out').querySelector(profile.pageStates.logoutLink)).toBeNull();
    expect(load('shared/account-prompt').querySelector(profile.pageStates.accountPrompt.signature)).not.toBeNull();
    expect(load('flow2/filter-logged-in').querySelector(profile.pageStates.logoutLink)).not.toBeNull();
  });
  it('the department tree is JSON with the fields the profile names', () => {
    const nodes = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/shared/department-tree.json'), 'utf8'));
    expect(nodes.length).toBeGreaterThan(10);
    for (const key of profile.sharedSources.departmentTree.nodeAttributes) expect(nodes[0].attr[key], key).toBeTruthy();
    expect(nodes[0].attr.id).toMatch(/^deptid_\d+$/);
  });
  it('the category tree is JSON with the fields the profile names', () => {
    const nodes = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/shared/category-tree.json'), 'utf8'));
    expect(nodes).toHaveLength(61);
    for (const key of profile.sharedSources.categoryTree.nodeAttributes) expect(nodes[0].attr[key], key).toBeTruthy();
  });
  it('Flow 4 has no Category control a user could use (D38)', () => {
    expect(load('flow4/filter').querySelector('#txtaCPV')).toBeNull();
  });
});

describe('page states (M2-AT1)', () => {
  for (const [name, m] of entries.filter(([, x]) => x.flow)) {
    it(`${name} is ${m.outcome}`, () => {
      const got = classifyPage({ doc: load(name), profile, flow: profile.flows[m.flow], kind: m.kind });
      expect(got.outcome, got.reason).toBe(m.outcome);
    });
  }
  it('no known layout has an unknown label', () => {
    for (const [name, m] of entries.filter(([, x]) => x.kind === 'detail' && x.outcome === 'OK')) {
      expect(readDetailLabels(load(name), profile.flows[m.flow]).unknown, name).toEqual([]);
    }
  });
});

describe('a changed page is caught, never read as OK (M2-AT2)', () => {
  const flow = profile.flows.tender_info;
  const check = (doc, kind, f = flow) => classifyPage({ doc, profile, flow: f, kind });

  it('a list column removed', () => {
    const doc = load('flow2/list');
    for (const r of doc.querySelectorAll('#resultTable > tbody > tr')) r.lastElementChild?.remove();
    expect(check(doc, 'list').outcome).toBe(OUTCOME.SHAPE_CHANGED);
  });
  it('the page count removed', () => {
    const doc = load('flow3/list');
    doc.querySelector('#totalPages').remove();
    expect(check(doc, 'list', profile.flows.app_info).outcome).toBe(OUTCOME.SHAPE_CHANGED);
  });
  it('a filter page losing a landmark', () => {
    const doc = load('flow2/filter');
    doc.querySelector('#cmbProcMethod').remove();
    expect(check(doc, 'filterPage').outcome).toBe(OUTCOME.SHAPE_CHANGED);
  });
  it('a detail page with a new title', () => {
    const doc = load('flow2/notice-works');
    doc.title = 'Something else';
    expect(check(doc, 'detail').outcome).toBe(OUTCOME.SHAPE_CHANGED);
  });
  it('a detail page whose labels are mostly unknown', () => {
    const doc = load('flow2/notice-works');
    for (const c of doc.querySelectorAll('td.ff')) c.textContent = `Renamed ${Math.random()}`;
    expect(check(doc, 'detail').outcome).toBe(OUTCOME.SHAPE_CHANGED);
  });
  it('a report losing a table', () => {
    const doc = load('flow1/report');
    doc.querySelector('#tab2').remove();
    expect(check(doc, 'report', profile.flows.procurement_transaction_report).outcome).toBe(OUTCOME.SHAPE_CHANGED);
  });
  it('one new label is reported, and the page still reads as OK', () => {
    const doc = load('flow2/notice-works');
    doc.querySelector('td.ff').textContent = 'A label from the future :';
    const got = check(doc, 'detail');
    expect(got.outcome).toBe(OUTCOME.OK);
    expect(got.unknownLabels).toContain('A label from the future');
  });
});

describe('empty is never a site change (M2-AT3)', () => {
  for (const name of ['flow2/list-empty', 'flow3/list-empty', 'flow4/list-empty', 'flow5/list-empty', 'flow1/report-empty']) {
    it(name, () => {
      const m = manifest[name];
      expect(classifyPage({ doc: load(name), profile, flow: profile.flows[m.flow], kind: m.kind }).outcome).toBe(OUTCOME.EMPTY);
    });
  }
});

describe('other page states', () => {
  const flow = profile.flows.tender_info;
  const blank = () => { const w = new Window(); w.document.write('<html><head><title>x</title></head><body>Hello</body></html>'); return w.document; };
  it('403 and 429 are a stop', () => {
    for (const status of [403, 429]) expect(classifyPage({ doc: blank(), profile, flow, kind: 'list', status }).outcome).toBe(OUTCOME.RATE_LIMITED);
  });
  it('a 500 is a server error', () => {
    expect(classifyPage({ doc: blank(), profile, flow, kind: 'list', status: 503 }).outcome).toBe(OUTCOME.SERVER_ERROR);
  });
  it('CAPTCHA wording is a stop', () => {
    const doc = blank();
    doc.body.textContent = 'Please complete the captcha to continue';
    expect(classifyPage({ doc, profile, flow, kind: 'list' }).outcome).toBe(OUTCOME.RATE_LIMITED);
  });
  it('a timed-out session is a login wall', () => {
    expect(classifyPage({ doc: blank(), profile, flow, kind: 'list', url: 'https://x/resources/common/SessionTimedOut.jsp' }).outcome).toBe(OUTCOME.LOGIN_WALL);
  });
  it('the mobile and NID prompt is its own state, never a site change', () => {
    expect(classifyPage({ doc: load('shared/account-prompt'), profile, flow, kind: 'filterPage' }).outcome).toBe(OUTCOME.ACCOUNT_PROMPT);
  });
  it('Flow 1 on a logged-out page is a login wall', () => {
    expect(classifyPage({ doc: load('shared/home-logged-out'), profile, flow: profile.flows.procurement_transaction_report, kind: 'filterPage' }).outcome).toBe(OUTCOME.LOGIN_WALL);
  });
  it('a logged-out Flow 2 page is fine, even with the login form on it', () => {
    expect(classifyPage({ doc: load('flow2/filter'), profile, flow, kind: 'filterPage' }).outcome).toBe(OUTCOME.OK);
  });
  it('a timeout is reported as such', () => {
    expect(classifyPage({ doc: blank(), profile, flow, kind: 'list', timedOut: true }).outcome).toBe(OUTCOME.TIMEOUT);
  });
});

describe('what a user cannot see does not exist (D41)', () => {
  const w = new Window();
  w.document.write('<body><div style="display: none"><table><tr><th id="a">Query</th></tr></table></div><table style="DISPLAY:NONE"><tr><td id="b">x</td></tr></table><p hidden id="c">x</p><p id="d">x</p></body>');
  const doc = w.document;
  it('reads hidden ancestors, in any spelling', () => {
    expect(isVisible(doc.getElementById('a'))).toBe(false);
    expect(isVisible(doc.getElementById('b'))).toBe(false);
    expect(isVisible(doc.getElementById('c'))).toBe(false);
    expect(isVisible(doc.getElementById('d'))).toBe(true);
  });
  it('a hidden label is not read at all', () => {
    const flow = profile.flows.tender_info;
    const page = new Window().document;
    page.write('<body><table style="display:none"><tr><td class="ff">A hidden label :</td></tr></table><table><tr><td class="ff">Ministry :</td></tr></table></body>');
    const labels = readDetailLabels(page, flow);
    expect(labels.known).toEqual(['Ministry']);
    expect(labels.unknown).toEqual([]);
  });
});

describe('fingerprints (M1-T10)', () => {
  it('match the recorded baseline', () => {
    for (const [name, m] of entries) {
      const window = new Window();
      window.document.write(m.fragment ? `<table id="f"><tbody>${raw(name)}</tbody></table>` : raw(name));
      expect(fingerprint(window.document.body), name).toBe(m.fingerprint);
    }
  });
  it('ignore values and row counts, and notice structure', () => {
    const page = (cells, rows) => { const w = new Window(); w.document.write(`<body><table>${Array(rows).fill(`<tr>${cells}</tr>`).join('')}</table></body>`); return fingerprint(w.document.body); };
    expect(page('<td>a</td>', 2)).toBe(page('<td>b</td>', 50));
    expect(page('<td>a</td>', 2)).not.toBe(page('<td>a</td><td>b</td>', 2));
  });
});

describe('waiting for a page to settle (M2-T02)', () => {
  const dom = () => {
    const window = new Window();
    globalThis.MutationObserver = window.MutationObserver;
    return window.document;
  };
  it('settles when ready and quiet', async () => {
    const doc = dom();
    const got = await waitForSettle({ root: doc.documentElement, ready: () => true, quietMs: 10, budgetMs: 500 });
    expect(got.settled).toBe(true);
  });
  it('reports a timeout when the landmark never comes', async () => {
    const doc = dom();
    const got = await waitForSettle({ root: doc.documentElement, ready: () => false, quietMs: 5, budgetMs: 40 });
    expect(got.settled).toBe(false);
  });
});
