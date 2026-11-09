// D65: which reports a Flow 1 grab makes.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { currentFiscalYear, reportCombos } from '../../src/shared/report-plan.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const profile = JSON.parse(readFileSync(path.join(root, 'profiles/eprocure.gov.bd.json'), 'utf8'));
const flow = profile.flows.procurement_transaction_report;
const years = ['2023-2024', '2024-2025', '2025-2026', '2026-2027', '2027-2028'].map((y) => ({ value: y, text: y }));
const offices = [{ value: '1', text: 'A' }, { value: '2', text: 'B' }, { value: '3', text: 'C' }];
const built = (year, office) => ({
  fields: { project: '77' },
  shown: [],
  loops: {
    financial_year: { field: 'financialyear', options: years, selected: year },
    pe_office: { field: 'offId', mirror: 'offName', options: offices, selected: office },
  },
});
const now = new Date(2026, 10, 9);

describe('fiscal year (July to June)', () => {
  it('is worked out from the date', () => {
    expect(currentFiscalYear(new Date(2026, 5, 30)).text).toBe('2025-2026');
    expect(currentFiscalYear(new Date(2026, 6, 1)).text).toBe('2026-2027');
  });
});

describe('reports a grab makes', () => {
  it('one year, one office: one report', () => {
    const { combos } = reportCombos(flow, built(years[1], offices[0]), {}, now);
    expect(combos).toHaveLength(1);
    expect(combos[0].fields).toMatchObject({ financialyear: '2024-2025', offId: '1', offName: 'A' });
  });
  it('all years stop at the current fiscal year, and each sends its own quarter range', () => {
    const { combos, sizes } = reportCombos(flow, built(null, offices[1]), { financial_year: true }, now);
    expect(combos.map((c) => c.labels.financial_year)).toEqual(['2023-2024', '2024-2025', '2025-2026', '2026-2027']);
    expect(combos[0].fields.quater).toBe('2023-07-1_2024-06-30');
    expect(sizes).toEqual({ financial_year: 4, pe_office: 1 });
  });
  it('all years and all offices: every pair', () => {
    const { combos } = reportCombos(flow, built(null, null), { financial_year: true, pe_office: true }, now);
    expect(combos).toHaveLength(12);
    expect(new Set(combos.map((c) => c.key)).size).toBe(12);
  });
});

describe('projects (D68)', () => {
  const withProjects = (year, office) => ({ ...built(year, office), loops: { ...built(year, office).loops, project: { field: 'project', mirror: 'projectname', options: [{ value: '77', text: 'Road' }, { value: '78', text: 'Bridge' }], selected: null } } });
  it('Not set: one report each, with no project', () => {
    const { combos } = reportCombos(flow, withProjects(years[1], offices[0]), {}, now);
    expect(combos).toHaveLength(1);
    expect(combos[0].fields).toMatchObject({ project: '0', projectname: '' });
  });
  it('projects with all offices: office 0, one report per year and project', () => {
    const { combos, sizes } = reportCombos(flow, withProjects(null, null), { financial_year: ['2024-2025', '2025-2026'], pe_office: true, project: ['77', '78'] }, now);
    expect(combos).toHaveLength(4);
    expect(combos.every((c) => c.fields.offId === '0' && c.labels.pe_office === 'All offices')).toBe(true);
    expect(sizes).toMatchObject({ financial_year: 2, project: 2 });
  });
  it('projects with chosen offices: every office, year and project', () => {
    const { combos } = reportCombos(flow, withProjects(null, null), { financial_year: true, pe_office: ['1', '3'], project: ['78'] }, now);
    expect(combos).toHaveLength(4 * 2);
    expect(new Set(combos.map((c) => c.labels.project))).toEqual(new Set(['Bridge']));
  });
});
