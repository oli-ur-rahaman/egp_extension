// B5/B6: every saved list, notice and report page parses as the Site Profile says. Values on these pages are masked, so shapes are checked.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';
import { parseDetail, parseList, parseReport } from '../../src/shared/page-parse.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/manifest.json'), 'utf8'));
const profile = JSON.parse(readFileSync(path.join(root, 'profiles/eprocure.gov.bd.json'), 'utf8'));
const raw = (name) => readFileSync(path.join(root, 'tests/fixtures', `${name}.html`), 'utf8');
const doc = (html) => {
  const window = new Window();
  window.document.write(html);
  return window.document;
};
const listDoc = (flow, name) => doc(`<!doctype html><body><table id="${flow.list.tableId}"><tbody>${raw(name)}</tbody></table></body>`);

describe('lists', () => {
  const cases = [
    ['flow2/list', 'tender_info', 'tender_id', /^\d+$/],
    ['flow3/list', 'app_info', 'package_id', /^\d+$/],
    ['flow4/list', 'contract_info', 'contract_id', /^\d+$/],
    ['flow5/list', 'experience_info', 'record_id', /^\d+$/],
  ];
  for (const [name, flowId, key, shape] of cases) {
    it(`${name}: every row has its key, every column a value`, () => {
      const flow = profile.flows[flowId];
      const { rows, totalPages } = parseList(listDoc(flow, name), flow);
      expect(rows.length).toBeGreaterThan(5);
      expect(totalPages).toBeGreaterThan(1);
      expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
      for (const row of rows) {
        expect(row.values[key]).toMatch(shape);
        for (const p of Object.values(row.open)) expect(p).not.toBe('');
      }
    });
  }

  it('Flow 2 splits its packed cells', () => {
    const flow = profile.flows.tender_info;
    const [row] = parseList(listDoc(flow, 'flow2/list'), flow).rows;
    expect(row.values.status).toBe('Live');
    expect(row.values.procurement_nature).toBe('Goods');
    expect(row.values.title).not.toBe('');
    expect(row.values.procurement_type).toBe('NCT');
    expect(row.values.procurement_method).toBe('OTM');
    expect(row.values.publishing_datetime).toMatch(/^\d{2}-[A-Z][a-z]{2}-\d{4} \d{2}:\d{2}$/);
    expect(row.open).toEqual({ h: 't', id: row.values.tender_id });
  });

  it('Flow 4 separates reference, title and date, and takes IDs from the link', () => {
    const flow = profile.flows.contract_info;
    const [row] = parseList(listDoc(flow, 'flow4/list'), flow).rows;
    expect(row.values.tender_id).toMatch(/^\d+$/);
    expect(row.values.reference_no).not.toMatch(/^\d+,/);
    expect(row.values.title).not.toMatch(/\d{2}-[A-Z][a-z]{2}-\d{4}/);
    expect(row.values.advertisement_date).toMatch(/^\d{2}-[A-Z][a-z]{2}-\d{4}/);
    expect(row.values.value_crore).toMatch(/^[\d.]+$/);
  });

  it('Flow 5: a cell holding only its link is a title, with no ID or reference', () => {
    const flow = profile.flows.experience_info;
    const html = raw('flow5/list').replace(/(<td class="t-align-center">)\d+, [^<]*<br>(<a [^>]*VieweCmsDetails[^>]*>[^<]*<\/a>)<br>[^<]*/, '$1$2');
    const row = parseList(doc(`<body><table id="resultTable"><tbody>${html}</tbody></table></body>`), flow).rows[0];
    expect(row.values.title).not.toBe('');
    expect(row.values.reference_no).toBe('');
    expect(row.values.publishing_date).toBe('');
    expect(row.values.tender_id).toBe('Manual');
  });

  it('Flow 5 splits ID and reference at the comma; a record with no ID says Manual', () => {
    const flow = profile.flows.experience_info;
    const [row] = parseList(listDoc(flow, 'flow5/list'), flow).rows;
    expect(row.values.tender_id).toMatch(/^\d+$/);
    expect(row.values.reference_no).not.toContain(row.values.tender_id + ',');
    const manual = raw('flow5/list').replace(/<td class="t-align-center">\d+, /, '<td class="t-align-center">-, ');
    const got = parseList(doc(`<body><table id="resultTable"><tbody>${manual}</tbody></table></body>`), flow).rows[0];
    expect(got.values.tender_id).toBe('Manual');
    expect(got.key).toBe(got.values.record_id);
  });

  for (const n of [2, 3, 4, 5]) {
    it(`flow${n}: an empty answer is empty, whatever its page count says`, () => {
      const flow = Object.values(profile.flows).find((f) => f.number === n);
      const got = parseList(listDoc(flow, `flow${n}/list-empty`), flow);
      expect(got.empty).toBe(true);
      expect(got.rows).toEqual([]);
    });
  }
});

describe('detail pages', () => {
  const details = Object.entries(manifest).filter(([, m]) => m.kind === 'detail' && m.outcome !== 'REFUSED');
  for (const [name, meta] of details) {
    it(`${name}: reads fields, with no new labels`, () => {
      const flow = profile.flows[meta.flow];
      const { values, unknown } = parseDetail(doc(raw(name)), flow);
      expect(Object.keys(values).length).toBeGreaterThan(5);
      expect(unknown).toEqual([]);
    });
  }

  it('a notice\'s lot table is read by its headings, and two lots are both kept', () => {
    const flow = profile.flows.tender_info;
    const page = doc(raw('flow2/notice-works'));
    const one = parseDetail(page, flow);
    expect(one.lots).toBe(1);
    expect(one.values.lot_no).not.toBe('');
    expect(one.values.location).not.toBe('');
    const table = [...page.querySelectorAll('th')].find((t) => t.textContent.includes('Lot No.')).closest('table');
    const row = table.querySelectorAll('tr')[1];
    const second = row.cloneNode(true);
    second.children[0].textContent = '2';
    row.parentElement.append(second);
    const two = parseDetail(page, flow);
    expect(two.lots).toBe(2);
  });

  it('a label nobody has seen is reported, and the page still reads', () => {
    const flow = profile.flows.tender_info;
    const page = doc(raw('flow2/notice-works').replace('Evaluation Type :', 'Brand New Label :'));
    const got = parseDetail(page, flow);
    expect(got.unknown).toEqual(['Brand New Label']);
    expect(got.values.app_id).not.toBeUndefined();
  });
});

describe('report (Flow 1)', () => {
  const flow = profile.flows.procurement_transaction_report;
  it('gives method rows, budget totals and a grand total', () => {
    const { rows } = parseReport(doc(raw('flow1/report')), flow);
    expect(rows.filter((r) => r.kind === 'Budget Total').map((r) => r.budget)).toEqual(['Development', 'Revenue', 'Own Fund']);
    expect(rows.at(-1).kind).toBe('Grand Total');
    const method = rows[0];
    expect(method.kind).toBe('Method');
    expect(method.method).toBe('OTM');
    expect(method.nature).toBe('Goods');
    expect(method.values.planned_packages_national).toBe('4');
  });
  it('method rows add up to each budget total, and those to the grand total', () => {
    const { rows } = parseReport(doc(raw('flow1/report')), flow);
    const sum = (list, key) => list.reduce((a, r) => a + (Number(r.values[key]) || 0), 0);
    for (const budget of ['Development', 'Revenue']) {
      const lines = rows.filter((r) => r.budget === budget);
      expect(sum(lines.filter((r) => r.kind === 'Method'), 'planned_packages_national')).toBe(sum(lines.filter((r) => r.kind === 'Budget Total'), 'planned_packages_national'));
    }
    expect(sum(rows.filter((r) => r.kind === 'Budget Total'), 'planned_packages_national')).toBe(sum(rows.filter((r) => r.kind === 'Grand Total'), 'planned_packages_national'));
  });
  it('works the percentages out itself, because the raw answer leaves them to a script', () => {
    const { rows } = parseReport(doc(raw('flow1/report')), flow);
    const r = rows[0].values;
    expect(Number(r.progress_packages_national)).toBeCloseTo((Number(r.awarded_packages_national) / Number(r.planned_packages_national)) * 100, 2);
  });
});
