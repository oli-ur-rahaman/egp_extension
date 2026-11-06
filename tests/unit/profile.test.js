// M1-AT1 (profile validates), M1-AT4 (layers merge in priority order), and the owner's decisions read back from the profile.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildProfile, checkConsistency, checkSchema, classifyLabel, loadProfile, mergeLayers, ProfileError } from '../../src/shared/profile.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const readJson = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const shipped = readJson('profiles/eprocure.gov.bd.json');
const schema = readJson('profiles/schema.json');
const census = readJson('tests/fixtures/label-census.json');
const flows = shipped.flows;
const copy = () => structuredClone(shipped);
const DETAIL_FLOWS = { 2: flows.tender_info, 3: flows.app_info, 4: flows.contract_info, 5: flows.experience_info };

describe('the shipped profile', () => {
  it('passes the schema and the consistency checks', () => {
    expect(checkSchema(shipped, schema)).toEqual([]);
    expect(checkConsistency(shipped)).toEqual([]);
  });

  it('loads through the packaged-file route', async () => {
    const profile = await loadProfile({ readJson: async (file) => readJson(file) });
    expect(profile.profileVersion).toBe('1.0.0');
    expect(Object.keys(profile.flows)).toHaveLength(5);
  });

  it('holds no option lists, so the page stays the source of truth (D18)', () => {
    for (const flow of Object.values(flows)) {
      for (const f of flow.filters) {
        expect(f.options, f.id).toBeUndefined();
        // Choices exist only where the panel must translate the page's own control.
        if (f.choices) expect(['status', 'tender_type']).toContain(f.id);
      }
    }
  });

  it('never fills the login or account forms', () => {
    const never = shipped.pageStates.neverFill;
    for (const flow of Object.values(flows)) {
      for (const f of flow.filters) {
        for (const s of [f.selector, ...(f.parts ?? []).map((p) => p.selector)]) expect(never).not.toContain(s);
      }
    }
  });
});

describe("the owner's decisions", () => {
  const panel = (flow) => flow.filters.filter((f) => f.panel).map((f) => f.id);

  it('Flow 1 shows Financial Year and PE Office only, and All loops offices (D12)', () => {
    const f = flows.procurement_transaction_report;
    expect(f.filters).toHaveLength(6);
    expect(panel(f)).toEqual(['financial_year', 'pe_office']);
    expect(f.filters.find((x) => x.id === 'pe_office').allMeansLoop).toBe(true);
    expect(f.filters.filter((x) => !x.panel).every((x) => x.leaveAsPageHasIt)).toBe(true);
    expect(f.login.policy).toBe('required');
  });

  it('keeps every filter on Flows 2-5: 13, 11, 15, 13', () => {
    expect(panel(flows.tender_info)).toHaveLength(13);
    expect(panel(flows.app_info)).toHaveLength(11);
    expect(panel(flows.contract_info)).toHaveLength(15);
    expect(panel(flows.experience_info)).toHaveLength(13);
  });

  it('leaves out Flow 4 Category, which the page has commented out (D38, E22)', () => {
    expect(panel(flows.contract_info)).not.toContain('category');
  });

  it('applies the mandatory filters (D13, D15, D19, D20)', () => {
    expect(flows.tender_info.rules.required).toEqual(['department', 'publishing_date']);
    expect(flows.tender_info.rules.window).toEqual({ filter: 'publishing_date', maxYears: 5, currentDateCheckboxes: true });
    expect(flows.app_info.rules.required).toEqual(['department', 'financial_year']);
    expect(flows.contract_info.rules.required).toEqual(['department', 'sign_date']);
    expect(flows.contract_info.rules.window.maxYears).toBe(5);
    expect(flows.experience_info.rules.required).toEqual(['department', 'contract_start_date']);
    expect(flows.experience_info.rules.window.maxYears).toBe(5);
  });

  it('lets a contractor filter lift the requirement, up to 5,000 rows (D21, D22)', () => {
    expect(flows.contract_info.rules.exemptions).toEqual([{ anyOf: ['contract_award_to'], lifts: ['department', 'sign_date'], maxRows: 5000 }]);
    const e = flows.experience_info.rules.exemptions[0];
    expect(e.anyOf).toEqual(expect.arrayContaining(['contract_awarded_to', 'company_unique_id']));
    expect(e.maxRows).toBe(5000);
    // A Tender ID search lifts the window only: Department stays mandatory (D13).
    expect(flows.tender_info.rules.exemptions[0].lifts).toEqual(['publishing_date']);
  });

  it('defaults Status and Tender Type to All (flow notes, D20)', () => {
    expect(flows.tender_info.filters.find((f) => f.id === 'status').default).toBe('AllTenders');
    expect(flows.experience_info.filters.find((f) => f.id === 'tender_type').default).toBe('All');
  });

  it('warns before a logged-out Flow 2, in the owner\'s words (D37)', () => {
    expect(flows.tender_info.login.startWarning).toEqual({
      state: 'loggedOut',
      text: "This page won't list LTM and some other methods. Logging in may show more, for your own department. Proceed?",
    });
  });

  it('runs Flows 3-5 in either login state (D35)', () => {
    for (const f of [flows.app_info, flows.contract_info, flows.experience_info]) expect(f.login.policy).toBe('either');
    // Not yet checked, so the build can't assume a logged-in user may pick another department here.
    expect(flows.contract_info.login.departmentWhenLoggedIn).toBe('notChecked');
    expect(flows.experience_info.login.departmentWhenLoggedIn).toBe('notChecked');
  });

  it('warns about the two filters the portal breaks (E1, E2)', () => {
    const byId = (id) => flows.tender_info.filters.find((f) => f.id === id);
    expect(byId('framework').warnWhen.state).toBe('always');
    expect(byId('budget_type').warnWhen.state).toBe('loggedIn');
  });

  it('uses Tender ID as the unique ID wherever a page has one (D39)', () => {
    expect(flows.tender_info.naturalKey.key).toBe('tender_id');
    expect(flows.contract_info.naturalKey.key).toBe('tender_id');
    expect(flows.experience_info.naturalKey.key).toBe('tender_id');
    // Manually entered experience has no Tender ID: the column says Manual, and the record's own ID keeps rows apart.
    expect(flows.experience_info.naturalKey.whenMissing).toBe('Manual');
    expect(flows.experience_info.naturalKey.fallback).toBe('record_id');
    // Flow 3 has no Tender ID to use: a plan comes before its tender.
    const keys3 = flows.app_info.list.columns.flatMap((c) => c.parts.map((p) => p.key));
    expect(keys3).not.toContain('tender_id');
    expect(flows.app_info.naturalKey.key).toBe('package_id');
    for (const flow of Object.values(DETAIL_FLOWS)) expect(flow.naturalKey.confirmedByOwner).toBe(true);
  });

  it('uses 100 rows a page on every list', () => {
    for (const flow of Object.values(DETAIL_FLOWS)) expect(flow.list.request.defaultSize).toBe(100);
  });

  it('has 6 clusters per flow, so one tick per cluster (D32)', () => {
    for (const flow of Object.values(DETAIL_FLOWS)) expect(flow.detail.clusters).toHaveLength(6);
  });

  it('keeps the contractor link fields (D24)', () => {
    expect(flows.contract_info.detail.fields.map((f) => f.id)).toContain('tenderer_id');
    const keys = flows.experience_info.list.columns.flatMap((c) => c.parts.map((p) => p.key));
    expect(keys).toContain('company_unique_id');
  });

  it('names older-only Flow 4 columns "Older:" (D31)', () => {
    const older = flows.contract_info.detail.fields.filter((f) => f.older);
    expect(older.length).toBeGreaterThan(0);
    for (const f of older) expect(f.header).toMatch(/^Older: /);
    for (const f of flows.contract_info.detail.fields.filter((x) => !x.older)) expect(f.header).not.toMatch(/^Older: /);
  });
});

describe("officials' details are public and collected (D40); owners stay out (D19)", () => {
  const OFFICIALS = {
    2: ['Name of Official Inviting Tender/Proposal', 'Designation of Official Inviting Tender/Proposal', 'Address of Official Inviting Tender/Proposal', 'Contact details of Official Inviting Tender/Proposal', 'Name of Official Inviting REOI', 'Contact details of Official Inviting RFP'],
    3: ['Procuring Entity'],
    4: ['Name of Authorised Officer', 'Designation of Authorised Officer'],
    5: ['PE Name'],
  };
  for (const [n, labels] of Object.entries(OFFICIALS)) {
    it(`Flow ${n}: officials are fields`, () => {
      for (const label of labels) expect(classifyLabel(DETAIL_FLOWS[n], label)?.field, label).toBeDefined();
    });
  }
  it('Beneficial Ownership stays out', () => {
    for (const flow of [flows.contract_info, flows.experience_info]) {
      expect(classifyLabel(flow, 'Beneficial Ownership (%)').ignored.reason).toBe('personal');
    }
  });
  it('the Queries and Replies table is hidden on the page, so it stays out (E23)', () => {
    expect(classifyLabel(flows.tender_info, 'Query').ignored.reason).toBe('hidden');
  });
});

describe('every label the study saw has a home', () => {
  for (const n of ['2', '3', '4', '5']) {
    it(`Flow ${n}: ${census.flows[n].pages} pages' labels are all accounted for`, () => {
      const seen = [...Object.keys(census.flows[n].labels), ...Object.keys(census.flows[n].tableHeaders)];
      const refusal = DETAIL_FLOWS[n].detail.refusalText;
      const unknown = seen.filter((label) => label !== refusal && !classifyLabel(DETAIL_FLOWS[n], label));
      expect(unknown).toEqual([]);
    });
  }

  it('the census holds labels only: no IDs or memo numbers', () => {
    const everything = JSON.stringify(census.flows);
    expect(everything).not.toMatch(/\d{2}\.\d{2}\.\d{4}/);
    expect(everything).not.toMatch(/memo no/i);
  });

  it('a label never seen is unknown, not an error', () => {
    expect(classifyLabel(flows.tender_info, 'A label from the future')).toBeNull();
  });

  it('reads label variants as one field', () => {
    const closing = (l) => classifyLabel(flows.tender_info, l).field.id;
    expect(closing('Tender/Proposal ClosingDate and Time')).toBe('closing');
    expect(closing('EOI ClosingDate and Time')).toBe('closing');
    expect(closing('  ClosingDate   and Time : ')).toBe('closing');
    expect(classifyLabel(flows.tender_info, 'Amendment / Corrigendum No. : 12').field.id).toBe('amendments');
  });
});

describe('merging layers (M1-AT4)', () => {
  it('later layers win, shipped < override < session', () => {
    const merged = mergeLayers({ a: 1, b: 1, c: 1 }, { b: 2, c: 2 }, { c: 3 });
    expect(merged).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('merges nested objects and leaves the inputs alone', () => {
    const base = { x: { y: 1, z: 1 } };
    expect(mergeLayers(base, { x: { z: 2 } })).toEqual({ x: { y: 1, z: 2 } });
    expect(base.x.z).toBe(1);
  });

  it('patches one entry of an id list, and adds new ones', () => {
    const merged = mergeLayers({ f: [{ id: 'a', s: 1, t: 1 }, { id: 'b', s: 1 }] }, { f: [{ id: 'a', s: 2 }, { id: 'c', s: 3 }] });
    expect(merged.f).toEqual([{ id: 'a', s: 2, t: 1 }, { id: 'b', s: 1 }, { id: 'c', s: 3 }]);
  });

  it('replaces plain lists whole', () => {
    expect(mergeLayers({ l: ['a', 'b'] }, { l: ['c'] })).toEqual({ l: ['c'] });
  });

  it('skips missing layers', () => {
    expect(mergeLayers({ a: 1 }, null, undefined)).toEqual({ a: 1 });
  });

  it('a repair can change one selector without touching the shipped profile', () => {
    const override = { flows: { tender_info: { filters: [{ id: 'department', selector: '#repaired' }] } } };
    const profile = buildProfile({ shipped, schema, override });
    expect(profile.flows.tender_info.filters.find((f) => f.id === 'department').selector).toBe('#repaired');
    expect(profile.flows.tender_info.filters).toHaveLength(13);
    expect(shipped.flows.tender_info.filters.find((f) => f.id === 'department').selector).toBe('#txtdepartment');
  });

  it('the session layer beats the override', () => {
    const f = (selector) => ({ flows: { tender_info: { filters: [{ id: 'department', selector }] } } });
    const profile = buildProfile({ shipped, schema, override: f('#o'), session: f('#s') });
    expect(profile.flows.tender_info.filters.find((x) => x.id === 'department').selector).toBe('#s');
  });
});

describe('a bad profile is refused, naming every fault', () => {
  const faults = (change) => {
    const p = copy();
    change(p);
    try {
      buildProfile({ shipped: p, schema });
      return [];
    } catch (e) {
      expect(e).toBeInstanceOf(ProfileError);
      return e.problems;
    }
  };

  it('a missing flow', () => {
    expect(faults((p) => delete p.flows.app_info).join()).toContain('app_info');
  });
  it('a mistyped property', () => {
    expect(faults((p) => { p.flows.tender_info.filters[0].selecter = '#x'; }).join()).toContain('selecter');
  });
  it('a bad version', () => {
    expect(faults((p) => { p.profileVersion = 'one'; }).join()).toContain('profileVersion');
  });
  it('a value outside its list', () => {
    expect(faults((p) => { p.flows.tender_info.login.policy = 'maybe'; }).join()).toContain('maybe');
  });
  it('a rule naming a filter that does not exist', () => {
    expect(faults((p) => { p.flows.tender_info.rules.required.push('ghost'); }).join()).toContain('ghost');
  });
  it('a field in an unknown cluster', () => {
    expect(faults((p) => { p.flows.tender_info.detail.fields[0].cluster = 'nowhere'; }).join()).toContain('nowhere');
  });
  it('a label claimed by two fields', () => {
    expect(faults((p) => { p.flows.tender_info.detail.fields[1].labels.push('Event Type'); }).join()).toContain('Event Type');
  });
  it('a left-out label also made a field', () => {
    expect(faults((p) => { p.flows.contract_info.detail.fields[0].labels.push('Beneficial Ownership (%)'); }).join()).toContain('both field');
  });
  it('the wrong number of clusters (D32)', () => {
    const got = faults((p) => {
      p.flows.app_info.detail.clusters = p.flows.app_info.detail.clusters.slice(0, 4);
      p.flows.app_info.detail.fields = p.flows.app_info.detail.fields.filter((f) => ['identity', 'organisation', 'procurement', 'package'].includes(f.cluster));
    });
    expect(got.join()).toContain('D32');
  });
  it('a natural key the list does not have', () => {
    expect(faults((p) => { p.flows.tender_info.naturalKey.key = 'nope'; }).join()).toContain('nope');
  });
  it('lists all the faults at once', () => {
    const got = faults((p) => {
      p.flows.tender_info.rules.required.push('ghost1');
      p.flows.app_info.rules.required.push('ghost2');
    });
    expect(got.join()).toContain('ghost1');
    expect(got.join()).toContain('ghost2');
  });
});
