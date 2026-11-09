// D66: PWD's offices placed in the owner's hierarchy, and runs over several offices.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { flatNodes, isPwdList, officesUnder, placeOffices } from '../../src/shared/offices.js';
import { reportCombos } from '../../src/shared/report-plan.js';
import { createEngine } from '../../src/background/engine.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const tree = JSON.parse(readFileSync(path.join(root, 'profiles/pwd-offices.json'), 'utf8'));
const live = Object.entries(tree.egpOffices).map(([value, text]) => ({ value, text }));

describe('the shipped tree', () => {
  it('has the five levels, and places most of e-GP\'s 224 offices', () => {
    const nodes = flatNodes(tree);
    expect(new Set(nodes.map((n) => n.node.level))).toEqual(new Set([1, 2, 3, 4, 5]));
    const placed = nodes.filter((n) => n.node.egpId).length;
    expect(live).toHaveLength(224);
    expect(placed).toBeGreaterThan(180);
  });
  it('holds no one\'s personal details, only offices', () => {
    const text = JSON.stringify(tree);
    expect(text).not.toMatch(/@|\b01\d{9}\b/);
  });
  it('no e-GP office sits in two places', () => {
    const ids = flatNodes(tree).map((n) => n.node.egpId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('placing the live list', () => {
  it('every live office appears once: in the tree or in Not in the hierarchy', () => {
    const { roots, unplaced } = placeOffices(tree, {}, live);
    const inTree = roots.flatMap(officesUnder);
    expect(new Set(inTree).size).toBe(inTree.length);
    expect(inTree.length + unplaced.length).toBe(224);
    expect(unplaced.some((o) => /invalid/i.test(o.text))).toBe(true);
  });
  it('offers zone, circle and division offices by level', () => {
    const { levels } = placeOffices(tree, {}, live);
    expect(levels[2].length).toBeGreaterThan(5);
    expect(levels[3].length).toBeGreaterThan(20);
    expect(levels[4].length).toBeGreaterThan(80);
  });
  it('a branch with no live office is left out', () => {
    const { roots } = placeOffices(tree, {}, live.slice(0, 3));
    expect(roots.flatMap(officesUnder).length).toBeLessThanOrEqual(3);
  });
  it('the user can place an unplaced office, and take a placed one out', () => {
    const { unplaced } = placeOffices(tree, {}, live);
    const loose = unplaced[0].value;
    const placedNode = flatNodes(tree).find((n) => n.node.egpId && n.node.level === 4).node;
    const circle = flatNodes(tree).find((n) => n.node.level === 3).node;
    const got = placeOffices(tree, { [loose]: circle.id, [placedNode.egpId]: null }, live);
    expect(got.unplaced.map((o) => o.value)).not.toContain(loose);
    expect(got.unplaced.map((o) => o.value)).toContain(placedNode.egpId);
    expect(got.levels[4]).toContain(loose);
  });
  it('is used only for a list that is mostly PWD\'s offices', () => {
    expect(isPwdList(tree, live)).toBe(true);
    expect(isPwdList(tree, [{ value: 'x1', text: 'A' }, { value: 'x2', text: 'B' }])).toBe(false);
  });
});

describe('several offices', () => {
  it('Flow 1: only the chosen offices are reported', () => {
    const profile = JSON.parse(readFileSync(path.join(root, 'profiles/eprocure.gov.bd.json'), 'utf8'));
    const flow = profile.flows.procurement_transaction_report;
    const built = { fields: {}, shown: [], loops: {
      financial_year: { field: 'financialyear', options: [{ value: '2024-2025', text: '2024-2025' }], selected: { value: '2024-2025', text: '2024-2025' } },
      pe_office: { field: 'offId', mirror: 'offName', options: live.slice(0, 10), selected: null },
    } };
    const { combos } = reportCombos(flow, built, { pe_office: [live[2].value, live[5].value] }, new Date(2026, 10, 10));
    expect(combos.map((c) => c.fields.offId)).toEqual([live[2].value, live[5].value]);
  });

  it('Flows 2 to 5: one search per office, each swept to its end, rows kept once', async () => {
    const runs = new Map();
    const rows = new Map();
    const store = {
      getRun: async (id) => structuredClone(runs.get(id)),
      saveRun: async (r) => { runs.set(r.id, structuredClone(r)); },
      allRuns: async () => [...runs.values()],
      countRows: async () => rows.size,
      addRows: async (_id, list) => { for (const r of list) if (!rows.has(r.key)) rows.set(r.key, r); },
      nextPending: async () => [...rows.values()].find((r) => r.pending === 1),
      saveDetail: async (_id, key, change) => { rows.set(key, { ...rows.get(key), ...change, pending: 0 }); },
    };
    // Office A has 150 rows over 2 pages, office B has none, office C has 30.
    const sizes = { A: 150, B: 0, C: 30 };
    const asked = [];
    const transport = {
      list: async (_run, page, size, fields) => {
        asked.push(`${fields.office}:${page}`);
        const total = sizes[fields.office];
        const slice = Array.from({ length: total }, (_, i) => ({ key: `${fields.office}${i}`, values: {}, open: {} })).slice((page - 1) * size, page * size);
        if (!slice.length) return { outcome: 'EMPTY', empty: true, rows: [] };
        return { outcome: 'OK', rows: slice, totalPages: Math.ceil(total / size), empty: false };
      },
    };
    const engine = createEngine({ store, transport, pacing: { paceMs: 0, jitterMs: 0, backoffSeconds: [0], sessionCheckEvery: 100 }, sleep: async () => {}, random: () => 0 });
    const run = await engine.start({ tabId: 1, flowId: 'tender_info', fields: { office: '' }, shown: [], size: 100, repeatSize: 50, totalPages: 3, rows: 180, clusters: [],
      searches: ['A', 'B', 'C'].map((o) => ({ key: o, fields: { office: o }, labels: { office: o } })) });
    let got;
    for (let i = 0; i < 500; i++) {
      got = await store.getRun(run.id);
      if (got.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 1));
    }
    expect(got.status).toBe('finished');
    expect(asked).toEqual(['A:1', 'A:2', 'B:1', 'C:1']);
    expect(rows.size).toBe(180);
    expect(got.expected).toBe(180);
  });
});
