// M9, M10: types, columns and the file itself. Read back with SheetJS, as an independent reader.
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';
import * as XLSX from '../../vendor/xlsx.js';
import { parseDetail, parseList, parseReport } from '../../src/shared/page-parse.js';
import { buildWorkbook, columnsFor, excelDate, fileName, typed, verdictOf } from '../../src/shared/export.js';
import { buildXlsx, colName } from '../../src/shared/xlsx-writer.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const profile = JSON.parse(readFileSync(path.join(root, 'profiles/eprocure.gov.bd.json'), 'utf8'));
const raw = (name) => readFileSync(path.join(root, 'tests/fixtures', `${name}.html`), 'utf8');
const doc = (html) => {
  const window = new Window();
  window.document.write(html);
  return window.document;
};

const baseRun = (extra = {}) => ({
  status: 'finished', flowId: 'tender_info', startedAt: Date.UTC(2026, 10, 7, 4), finishedAt: Date.UTC(2026, 10, 7, 5), loggedIn: false, sweep: 1,
  shown: [{ label: 'Ministry/Division/Organization', value: 'Public Works' }, { label: 'Status', value: 'All' }, { label: 'Tender/Proposal ID', value: '-' }],
  clusters: [], expected: 0, interruptions: [], unknownLabels: [], offices: null, officeIndex: 0,
  stats: { rows: 0, detailTotal: 0, detailDone: 0, detailFailed: 0, refused: 0, multiLot: 0 }, ...extra,
});

async function readBack(sheets) {
  const blob = await buildXlsx(sheets);
  return XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array', cellDates: false, cellStyles: true });
}

const flowRows = (flowId, name, detailPage) => {
  const flow = profile.flows[flowId];
  const page = doc(`<body><table id="resultTable"><tbody>${raw(name)}</tbody></table></body>`);
  const detail = detailPage ? parseDetail(doc(raw(detailPage)), flow).values : null;
  return parseList(page, flow).rows.map((r, seq) => ({ key: r.key, seq, list: r.values, detail, outcome: detail ? 'ok' : undefined }));
};

describe('types', () => {
  it('dates become real dates, and bad ones stay as written', () => {
    expect(excelDate('01-Jan-2024')).toBe(45292);
    expect(excelDate('01-Jan-2024 12:00')).toBe(45292.5);
    expect(typed('date', 'soon')).toBe('soon');
  });
  it('amounts become numbers, IDs stay text, N.A. is empty', () => {
    expect(typed('money', '1,234.50')).toBe(1234.5);
    expect(typed('id', '00123')).toBe('00123');
    expect(typed('money', 'N.A.')).toBeNull();
    expect(typed('text', '')).toBeNull();
    expect(typed('moneyWithCurrency', '999.5 (BDT)')).toBe(999.5);
  });
});

describe('workbook', () => {
  it('has About this grab and Data, with a colour per column group', async () => {
    const flow = profile.flows.tender_info;
    const rows = flowRows('tender_info', 'flow2/list', 'flow2/notice-works');
    const run = baseRun({ clusters: ['identity', 'dates'], expected: rows.length, stats: { rows: rows.length, detailTotal: rows.length, detailDone: rows.length, detailFailed: 0, refused: 0, multiLot: 0 } });
    const book = await readBack(buildWorkbook({ flow, run, rows, toolVersion: '0.2.0', profileVersion: '1.1.0', siteHost: profile.site.host }));
    expect(book.SheetNames).toEqual(['About this grab', 'Data']);
    const data = XLSX.utils.sheet_to_json(book.Sheets.Data, { raw: true });
    expect(data).toHaveLength(rows.length);
    expect(data[0]['Filter: Ministry/Division/Organization']).toBe('Public Works');
    expect(data[0]['Tender/Proposal ID']).toBe(rows[0].list.tender_id);
    expect(typeof data[0]['Publishing Date and Time']).not.toBe('string');
    expect(data[0]['App ID']).toBeDefined();
    expect(data[0]['Detail page']).toBe('Read');
    const about = XLSX.utils.sheet_to_json(book.Sheets['About this grab'], { header: 1, raw: true }).flat().filter(Boolean);
    expect(about).toContain('Complete');
    expect(about).toContain('Tender Info');
    expect(about).toContain('Tenders by Procuring Entity');
  });

  it('keeps every flow\'s list and detail together without a clash in the headers', () => {
    const cases = [['tender_info'], ['app_info'], ['contract_info'], ['experience_info']];
    for (const [flowId] of cases) {
      const flow = profile.flows[flowId];
      const columns = columnsFor(flow, baseRun({ clusters: flow.detail.clusters.map((c) => c.id) }));
      const headers = columns.map((c) => c.header);
      expect(new Set(headers).size, flowId).toBe(headers.length);
      expect(headers.filter((x) => x.startsWith('Notice:')), flowId).toEqual(flowId === 'experience_info' ? [] : expect.any(Array));
    }
  });

  it('a value the detail page knows better replaces the list\'s', () => {
    const flow = profile.flows.tender_info;
    const columns = columnsFor(flow, baseRun({ clusters: ['organisation'] }));
    const ministry = columns.find((c) => c.key === 'ministry');
    expect(ministry.value({ list: { ministry: 'short' }, detail: { ministry_detail: 'full name' } })).toBe('full name');
    expect(ministry.value({ list: { ministry: 'short' }, detail: {} })).toBe('short');
  });

  it('Flow 1: office, kind and amounts, with totals marked', async () => {
    const flow = profile.flows.procurement_transaction_report;
    const report = parseReport(doc(raw('flow1/report')), flow).rows;
    const rows = report.map((r, seq) => ({ key: r.key, seq, list: { office: 'Office A', budget_type: r.budget, row_type: r.kind, method: r.method, nature: r.nature, ...r.values } }));
    const run = baseRun({ flowId: 'procurement_transaction_report', offices: [{ value: '1', text: 'Office A' }], officeIndex: 1, shown: [{ label: 'Financial Year', value: '2024-2025' }, { label: 'PE Office', value: 'All' }] });
    const book = await readBack(buildWorkbook({ flow, run, rows, toolVersion: '0.2.0', profileVersion: '1.1.0', siteHost: profile.site.host }));
    const data = XLSX.utils.sheet_to_json(book.Sheets.Data, { raw: true });
    expect(data.at(-1)['Row Type']).toBe('Grand Total');
    expect(data[0].Office).toBe('Office A');
    expect(typeof data[0]['Planned packages, National (No.)']).toBe('number');
  });

  it('says so plainly when a file isn\'t complete', () => {
    const flow = profile.flows.tender_info;
    expect(verdictOf(flow, baseRun({ expected: 10 }), 10).complete).toBe(true);
    expect(verdictOf(flow, baseRun({ expected: 10 }), 8).text).toContain('2 rows short');
    expect(verdictOf(flow, baseRun({ status: 'stopped', expected: 10 }), 10).text).toContain('Partial');
    expect(verdictOf(flow, baseRun({ expected: 10, stats: { detailFailed: 3 } }), 10).text).toContain("3 detail pages couldn't");
  });

  it('names the file by flow and time, and marks a partial one', () => {
    const name = fileName(profile.flows.tender_info, baseRun({ status: 'stopped' }), 'tender_info');
    expect(name).toMatch(/^pdms_tender_info_\d{4}-\d{2}-\d{2}_\d{4}_partial\.xlsx$/);
  });

  it('handles characters Excel would refuse, and long text', async () => {
    const book = await readBack([{ name: 'T', rows: [[{ v: 'a\u0001<&>"b' }, { v: 'x'.repeat(40000) }, { v: 5 }, { v: 2, f: 'SUM(C1:C1)' }]] }]);
    expect(book.Sheets.T.A1.v).toBe('a <&>"b');
    expect(book.Sheets.T.B1.v).toHaveLength(32767);
    expect(book.Sheets.T.D1.f).toBe('SUM(C1:C1)');
  });

  it('colName counts as Excel does', () => {
    expect(colName(0)).toBe('A');
    expect(colName(25)).toBe('Z');
    expect(colName(26)).toBe('AA');
    expect(colName(701)).toBe('ZZ');
    expect(colName(702)).toBe('AAA');
  });

  it('writes sample files for a second reader (openpyxl) to check', async () => {
    const out = path.join(root, 'test-results', 'xlsx');
    mkdirSync(out, { recursive: true });
    const samples = [['tender_info', 'flow2/list', 'flow2/notice-works'], ['app_info', 'flow3/list', 'flow3/package-works'], ['contract_info', 'flow4/list', 'flow4/contract-new'], ['experience_info', 'flow5/list', 'flow5/experience-jvca']];
    for (const [flowId, list, detail] of samples) {
      const flow = profile.flows[flowId];
      const rows = flowRows(flowId, list, detail);
      const run = baseRun({ flowId, clusters: flow.detail.clusters.map((c) => c.id), expected: rows.length, stats: { rows: rows.length, detailTotal: rows.length, detailDone: rows.length, detailFailed: 0, refused: 0, multiLot: 0 } });
      const blob = await buildXlsx(buildWorkbook({ flow, run, rows, toolVersion: '0.2.0', profileVersion: '1.1.0', siteHost: profile.site.host }));
      writeFileSync(path.join(out, `${flowId}.xlsx`), Buffer.from(await blob.arrayBuffer()));
    }
  });
});
