// M3-AT1-4: reading filters from saved pages, applying changes and waiting for child lists, the start rules, and which flow a page is.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';
import { applyDefaults, applyFilter, isPlaceholder, scanFilters } from '../../src/content/page-filters.js';
import { evaluateStart, formatDate, isSet, parseDate, resolveWindow, spanBetween, spanText } from '../../src/shared/filter-rules.js';
import { detectFlow, isPortal } from '../../src/shared/flow-detect.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const profile = JSON.parse(readFileSync(path.join(root, 'profiles/eprocure.gov.bd.json'), 'utf8'));
const load = (name) => {
  const window = new Window();
  window.document.write(readFileSync(path.join(root, 'tests/fixtures', `${name}.html`), 'utf8'));
  return window.document;
};
const PAGES = [
  ['flow1/filter', 'procurement_transaction_report', 3],
  ['flow2/filter', 'tender_info', 13],
  ['flow2/filter-logged-in', 'tender_info', 13],
  ['flow3/filter', 'app_info', 11],
  ['flow4/filter', 'contract_info', 15],
  ['flow5/filter', 'experience_info', 13],
];
const scanOf = (doc, flow) => Object.fromEntries(scanFilters(doc, flow).map((s) => [s.id, s]));

describe('reading the page (M3-AT1)', () => {
  for (const [name, flowId, count] of PAGES) {
    it(`${name}: finds all ${count} panel filters, none vanished`, () => {
      const scans = scanFilters(load(name), profile.flows[flowId]);
      expect(scans).toHaveLength(count);
      expect(scans.filter((s) => s.vanished).map((s) => s.id)).toEqual([]);
    });
  }
  it('reads dropdown items from the page, with no list stored anywhere (D18)', () => {
    const s = scanOf(load('flow2/filter'), profile.flows.tender_info);
    expect(s.procurement_nature.options.map((o) => o.text)).toEqual(['Goods', 'Works', 'Service', 'Physical Services']);
    expect(s.procurement_method.options).toHaveLength(16);
    expect(s.budget_type.options.map((o) => o.text)).toEqual(['Development', 'Revenue', 'Own Fund']);
  });
  it('Flow 1 reads the offices and years', () => {
    const s = scanOf(load('flow1/filter'), profile.flows.procurement_transaction_report);
    expect(s.pe_office.options.length).toBeGreaterThan(200);
    expect(s.financial_year.options.length).toBe(18);
  });
  it('a filter gone from the page is reported by name, not skipped', () => {
    const doc = load('flow2/filter');
    doc.querySelector('#cmbType').remove();
    expect(scanOf(doc, profile.flows.tender_info).procurement_type.vanished).toBe(true);
  });
  it('Department is free logged out and locked logged in on Flow 2', () => {
    expect(scanOf(load('flow2/filter'), profile.flows.tender_info).department.locked).toBe(false);
    expect(scanOf(load('flow2/filter-logged-in'), profile.flows.tender_info).department.locked).toBe(true);
  });
  it('a filter the user cannot see is locked, not offered (D41)', () => {
    const doc = load('flow3/filter');
    doc.querySelector('#txtdepartment').setAttribute('style', 'display: none');
    expect(scanOf(doc, profile.flows.app_info).department.locked).toBe(true);
  });
  it('compound filters read each part', () => {
    const s = scanOf(load('flow3/filter'), profile.flows.app_info).estimated_cost;
    expect(s.parts.map((p) => p.role)).toEqual(['operator', 'value', 'value2']);
    expect(s.parts[0].options.length).toBeGreaterThan(3);
  });
});

describe('placeholders are never values (M3-AT3)', () => {
  for (const [name, flowId] of PAGES) {
    it(name, () => {
      for (const s of scanFilters(load(name), profile.flows[flowId])) {
        for (const o of s.options ?? []) {
          expect(o.value.trim(), `${s.id}: ${o.text}`).not.toBe('');
          expect(o.text, s.id).not.toMatch(/^(-|please|select\b)/i);
        }
      }
    });
  }
  it('recognises each kind of "no selection"', () => {
    expect(isPlaceholder({ value: '', text: 'All' }, {})).toBe(true);
    expect(isPlaceholder({ value: ' ', text: 'x' }, { empty: ' ' })).toBe(true);
    expect(isPlaceholder({ value: '0', text: 'x' }, { empty: '0' })).toBe(true);
    expect(isPlaceholder({ value: '0', text: '-- Select --' }, {})).toBe(true);
    expect(isPlaceholder({ value: '2', text: 'Works' }, { empty: '' })).toBe(false);
  });
});

describe('applying to the page (M3-AT2)', () => {
  const noRequest = () => { throw new Error('no request expected'); };

  it('sets a dropdown and fires its change event', async () => {
    const doc = load('flow2/filter');
    let fired = 0;
    doc.querySelector('#procNature').addEventListener('change', () => { fired++; });
    await applyFilter({ doc, flow: profile.flows.tender_info, profile, filterId: 'procurement_nature', value: '2', request: noRequest });
    expect(doc.querySelector('#procNature').value).toBe('2');
    expect(fired).toBe(1);
  });
  it('All goes back to the page\'s own "no selection" entry', async () => {
    const doc = load('flow2/filter');
    const flow = profile.flows.tender_info;
    await applyFilter({ doc, flow, profile, filterId: 'procurement_method', value: '2', request: noRequest });
    await applyFilter({ doc, flow, profile, filterId: 'procurement_method', value: '0', request: noRequest });
    expect(doc.querySelector('#cmbProcMethod').value).toBe('0');
  });
  it('Department writes both boxes, then refills Procuring Entity from the lookup', async () => {
    const doc = load('flow2/filter');
    const calls = [];
    const request = async (url, init) => { calls.push({ url, body: init.body }); return '<option value="">-- Select --</option><option value="7">Office A</option><option value="8">Office B</option>'; };
    const { refilled } = await applyFilter({ doc, flow: profile.flows.tender_info, profile, filterId: 'department', value: { id: '21', name: 'PWD' }, request });
    expect(doc.querySelector('#txtdepartment').value).toBe('PWD');
    expect(doc.querySelector('#txtdepartmentid').value).toBe('21');
    expect(refilled).toEqual(['procuring_entity']);
    expect(calls).toEqual([{ url: '/ComboServlet', body: 'funName=officeCombo&departmentId=21' }]);
    const s = scanOf(doc, profile.flows.tender_info);
    expect(s.procuring_entity.options.map((o) => o.text)).toEqual(['Office A', 'Office B']);
  });
  it('a lookup answer can only add options: nothing else survives', async () => {
    const doc = load('flow2/filter');
    const request = async () => '<option value="1">A</option><img src=x onerror=alert(1)><script>alert(1)</script>';
    await applyFilter({ doc, flow: profile.flows.tender_info, profile, filterId: 'department', value: { id: '21', name: 'PWD' }, request });
    const select = doc.querySelector('#cmbOffice');
    expect(select.children.length).toBe(1);
    expect(select.querySelector('img, script')).toBeNull();
  });
  it('waits for a page\'s own handler to refill a child list', async () => {
    const doc = load('flow3/filter');
    const child = doc.querySelector('#cmbProject');
    doc.querySelector('#cmbYear').addEventListener('change', () => {
      setTimeout(() => { child.innerHTML = '<option value=" ">x</option><option value="P1">Project 1</option>'; }, 30);
    });
    const { refilled } = await applyFilter({ doc, flow: profile.flows.app_info, profile, filterId: 'financial_year', value: '2024-2025', request: noRequest, budgetMs: 1000 });
    expect(refilled).toEqual(['project_name']);
  });
  it('a child that never changes doesn\'t hang', async () => {
    const doc = load('flow3/filter');
    const { refilled } = await applyFilter({ doc, flow: profile.flows.app_info, profile, filterId: 'financial_year', value: '2024-2025', request: noRequest, budgetMs: 60 });
    expect(refilled).toEqual([]);
  });
  it('date ranges and compound filters write each box', async () => {
    const doc = load('flow2/filter');
    await applyFilter({ doc, flow: profile.flows.tender_info, profile, filterId: 'publishing_date', value: { from: '01/01/2023', to: '31/12/2025' }, request: noRequest });
    expect(doc.querySelector('#pubDtFrm').value).toBe('01/01/2023');
    expect(doc.querySelector('#pubDtTo').value).toBe('31/12/2025');
    const doc5 = load('flow5/filter');
    await applyFilter({ doc: doc5, flow: profile.flows.experience_info, profile, filterId: 'contract_awarded_to', value: { mode: 'Equals', text: 'abc' }, request: noRequest });
    expect(doc5.querySelector('#txtContractAwardTo').value).toBe('abc');
  });
  it('Category writes the chosen names', async () => {
    const doc = load('flow3/filter');
    await applyFilter({ doc, flow: profile.flows.app_info, profile, filterId: 'category', value: { names: ['A', 'B'] }, request: noRequest });
    expect(doc.querySelector('#txtaCPV').value).toBe('A; B');
  });
  it('never writes to the login form', async () => {
    const doc = load('flow2/filter');
    const before = doc.querySelector(profile.pageStates.loginForm)?.value;
    await applyFilter({ doc, flow: profile.flows.tender_info, profile, filterId: 'tender_id', value: '123', request: noRequest });
    expect(doc.querySelector(profile.pageStates.loginForm)?.value).toBe(before);
  });
});

describe('defaults (flow notes, D20)', () => {
  it('Flow 2 Status starts at All', () => {
    const doc = load('flow2/filter');
    applyDefaults(doc, profile.flows.tender_info);
    expect(doc.querySelector('#viewType').value).toBe('AllTenders');
  });
  it('Flow 5 Tender Type starts at All, matched by its label', () => {
    const doc = load('flow5/filter');
    applyDefaults(doc, profile.flows.experience_info);
    const select = doc.querySelector('#packageType');
    expect(select.options[select.selectedIndex].text.trim()).toBe('All');
  });
});

describe('start rules', () => {
  const today = new Date(Date.UTC(2026, 10, 7));
  const flows = profile.flows;
  const run = (flow, values, loggedIn = false) => evaluateStart(flow, values, { loggedIn, today });
  const dept = { id: '21', name: 'PWD' };
  const window = (from, to) => ({ from, to, fromToday: false, toToday: false });

  it('Flow 2 needs Department and a window (D13)', () => {
    const got = run(flows.tender_info, {});
    expect(got.ok).toBe(false);
    expect(got.reasons.join()).toContain('Choose Ministry/Division/Organization');
    expect(got.reasons.join()).toContain('Publishing Date');
  });
  it('Flow 2 accepts up to exactly 5 years, not a day more', () => {
    expect(run(flows.tender_info, { department: dept, publishing_date: window('01/01/2021', '01/01/2026') }).ok).toBe(true);
    const over = run(flows.tender_info, { department: dept, publishing_date: window('01/01/2021', '02/01/2026') });
    expect(over.ok).toBe(false);
    expect(over.reasons.join()).toContain('limit is 5 years');
  });
  it('current-date ticks resolve to today (D13)', () => {
    const got = run(flows.tender_info, { department: dept, publishing_date: { from: '07/11/2022', to: '', fromToday: false, toToday: true } });
    expect(got.ok).toBe(true);
    expect(got.window.span).toBe('4 y 0 m');
    expect(run(flows.tender_info, { department: dept, publishing_date: { from: '', to: '', fromToday: true, toToday: true } }).ok).toBe(true);
  });
  it('From after To is refused, and bad dates are named', () => {
    expect(run(flows.tender_info, { department: dept, publishing_date: window('01/01/2025', '01/01/2024') }).reasons.join()).toContain('must not be after');
    expect(run(flows.tender_info, { department: dept, publishing_date: window('31/02/2025', '01/03/2025') }).reasons.join()).toContain("isn't a real date");
  });
  it('a Tender ID lifts the window, not Department (D13)', () => {
    const noDept = run(flows.tender_info, { tender_id: '123' });
    expect(noDept.ok).toBe(false);
    expect(noDept.reasons.join()).not.toContain('Publishing');
    expect(run(flows.tender_info, { tender_id: '123', department: dept }).ok).toBe(true);
  });
  it('Flow 3 needs Department and Financial Year (D15)', () => {
    expect(run(flows.app_info, { department: dept }).ok).toBe(false);
    expect(run(flows.app_info, { department: dept, financial_year: '2024-2025' }).ok).toBe(true);
  });
  it('D58: the second degree is any one of its filters, and names them all when missing', () => {
    const missing = run(flows.tender_info, { department: dept });
    expect(missing.reasons.join()).toContain('Choose one of: Publishing Date, Procuring Entity or Closing Date.');
    expect(run(flows.tender_info, { department: dept, procuring_entity: '55' }).ok).toBe(true);
    expect(run(flows.tender_info, { department: dept, closing_date: window('01/01/2024', '31/12/2024') }).ok).toBe(true);
    expect(run(flows.tender_info, { department: dept, closing_date: window('01/01/2018', '31/12/2024') }).reasons.join()).toContain('limit is 5 years');
    expect(run(flows.app_info, { department: dept, project_name: '9' }).ok).toBe(true);
    expect(run(flows.app_info, { project_name: '9' }).reasons.join()).toContain('Choose Ministry/Division/Organization.');
    expect(run(flows.contract_info, { department: dept, award_date: '01/01/2025' }).ok).toBe(true);
    expect(run(flows.contract_info, { department: dept, procuring_entity: '55' }).ok).toBe(true);
    expect(run(flows.contract_info, { department: dept }).reasons.join()).toContain('Choose one of: Contract Sign Date, Procuring Entity, Advertisement Date, Date of Notification of Award or Contract Award to.');
    expect(run(flows.experience_info, { department: dept, procuring_entity: '55' }).ok).toBe(true);
    expect(run(flows.experience_info, { procuring_entity: '55' }).reasons.join()).toContain('Choose one of: Ministry/Division/Organization, Contract Awarded To or Company Unique ID.');
  });
  it('D58: a contractor search with Department named has no row limit', () => {
    const both = run(flows.contract_info, { department: dept, contract_award_to: 'A firm' });
    expect(both.ok).toBe(true);
    expect(both.exemptionUsed).toBe(false);
  });
  it('Flow 4 needs Department and a sign-date window, unless a contractor is named (D19, D21)', () => {
    expect(run(flows.contract_info, {}).ok).toBe(false);
    expect(run(flows.contract_info, { department: dept, sign_date: window('01/01/2021', '31/12/2025') }).ok).toBe(true);
    const named = run(flows.contract_info, { contract_award_to: 'A firm' });
    expect(named.ok).toBe(true);
    expect(named.exemptionUsed).toBe(true);
    expect(named.maxRows).toBe(5000);
  });
  it('Flow 5 lifts both for a contractor or company ID, not a blank mode (D20, D21)', () => {
    expect(run(flows.experience_info, { contract_awarded_to: { mode: 'Contains', text: '' } }).ok).toBe(false);
    expect(run(flows.experience_info, { contract_awarded_to: { mode: 'Contains', text: 'A firm' } }).ok).toBe(true);
    expect(run(flows.experience_info, { company_unique_id: '12345' }).ok).toBe(true);
    expect(run(flows.experience_info, { tender_id: '12345' }).ok).toBe(false);
  });
  it('an exemption doesn\'t excuse a nonsense date', () => {
    const got = run(flows.contract_info, { contract_award_to: 'A firm', sign_date: window('01/01/2025', '01/01/2024') });
    expect(got.ok).toBe(false);
  });
  it('Flow 1 needs a login; years, offices and projects all have defaults (D68)', () => {
    const flow = flows.procurement_transaction_report;
    expect(run(flow, { financial_year: '__all__', pe_office: '__all__' }, false).reasons.join()).toContain('needs a login');
    expect(run(flow, { financial_year: '__all__', pe_office: '__all__' }, true).ok).toBe(true);
    expect(run(flow, { financial_year: ['2024-2025'], pe_office: ['933'], project: ['77'] }, true).ok).toBe(true);
  });
  it('Between needs two values, in order', () => {
    const base = { department: dept, financial_year: '2024-2025' };
    expect(run(flows.app_info, { ...base, estimated_cost: { operator: 'Between', value: '5', value2: '2' } }).ok).toBe(false);
    expect(run(flows.app_info, { ...base, estimated_cost: { operator: 'Between', value: '2', value2: '5' } }).ok).toBe(true);
  });
  it('dates: real ones only, and spans read plainly', () => {
    expect(parseDate('29/02/2024')).not.toBeNull();
    expect(parseDate('29/02/2025')).toBeNull();
    expect(parseDate('2024-01-01')).toBeNull();
    expect(formatDate(parseDate('03/01/2021'))).toBe('03/01/2021');
    expect(spanText(spanBetween(parseDate('03/01/2021'), parseDate('31/12/2025')))).toBe('4 y 11 m');
    expect(resolveWindow({ fromToday: true, toToday: true }, today).from).toBe(today);
  });
  it('All counts as no value', () => {
    expect(isSet({ control: 'select', empty: '0' }, '0')).toBe(false);
    expect(isSet({ control: 'select', empty: ' ' }, ' ')).toBe(false);
    expect(isSet({ control: 'select', empty: '' }, '2')).toBe(true);
  });
});

describe('which flow is this page? (M3-AT4)', () => {
  const base = profile.site.baseUrl;
  it('recognises all five by address', () => {
    for (const [id, flow] of Object.entries(profile.flows)) expect(detectFlow(profile, base + flow.page.url)).toBe(id);
  });
  it('tells near-identical addresses apart', () => {
    expect(detectFlow(profile, `${base}/resources/common/AllTenders.jsp?h=f`)).toBeNull();
    expect(detectFlow(profile, `${base}/resources/common/SearcheCMS.jsp`)).toBeNull();
    expect(detectFlow(profile, `${base}/resources/common/AllTenders.jsp?h=t&x=1`)).toBe('tender_info');
  });
  it('ignores other sites and other portal pages', () => {
    expect(detectFlow(profile, 'https://example.com/resources/common/AllTenders.jsp?h=t')).toBeNull();
    expect(detectFlow(profile, `${base}/Index.jsp`)).toBeNull();
    expect(detectFlow(profile, 'not a url')).toBeNull();
    expect(isPortal(profile, `${base}/Index.jsp`)).toBe(true);
    expect(isPortal(profile, 'https://example.com/')).toBe(false);
  });
});
