// M9, M10: types, columns and the file itself. Read back with SheetJS, as an independent reader.
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';
import * as XLSX from '../../vendor/xlsx.js';
import { parseDetail, parseList, parseReport } from '../../src/shared/page-parse.js';
import { buildWorkbook, columnsFor, excelDate, fileName, typed, verdictOf } from '../../src/shared/export.js';
import { buildXlsx, colName } from '../../src/shared/xlsx-writer.js';
import { buildXls } from '../../src/shared/xls-writer.js';

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

describe('a chosen field (D55)', () => {
  it('only what was ticked becomes a column', () => {
    const flow = profile.flows.tender_info;
    const headers = columnsFor(flow, baseRun({ clusters: ['identity'], chosen: ['app_id'] })).filter((c) => c.group === 'detail').map((c) => c.header);
    expect(headers).toEqual(['App ID']);
  });
  it('the file names what was ticked in each group', () => {
    const flow = profile.flows.tender_info;
    const [about] = buildWorkbook({ flow, run: baseRun({ clusters: ['identity'], chosen: ['app_id', 'event_type'] }), rows: [], toolVersion: '1', profileVersion: '1', siteHost: 'x' });
    const text = about.rows.flat().map((c) => c?.v).filter(Boolean);
    expect(text).toContain('App ID, Event Type');
    expect(text.filter((v) => v === 'None').length).toBeGreaterThan(3);
  });
});

describe('.xls file (D54)', () => {
  const readXls = async (sheets) => {
    const blob = buildXls(sheets);
    return XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array' });
  };
  it('reads back with its text, numbers and sheets', async () => {
    const book = await readXls([
      { name: 'About this grab', rows: [[{ v: 'Title', s: { bold: true, fill: '1F3864', color: 'FFFFFF' } }]], merges: ['A1:D1'], widths: [30], hideGrid: true },
      { name: 'Data', freeze: true, widths: [12, 12, 12], rows: [[{ v: 'ID' }, { v: 'Amount' }, { v: 'Date' }], [{ v: '00123', s: { format: '@', border: true } }, { v: 1234.5, s: { format: '#,##0.000' } }, { v: 45292.5, s: { format: 'dd-mmm-yyyy hh:mm' } }]] },
    ]);
    expect(book.SheetNames).toEqual(['About this grab', 'Data']);
    const data = XLSX.utils.sheet_to_json(book.Sheets.Data, { raw: true, cellDates: false });
    expect(data[0].ID).toBe('00123');
    expect(data[0].Amount).toBe(1234.5);
  });
  it('holds text in Bangla, and text longer than a record', async () => {
    const long = 'x'.repeat(20000);
    const book = await readXls([{ name: 'T', rows: [[{ v: long }, { v: 'বাংলা' }, { v: 'a\u0001b' }, { v: '' }, { v: 'after' }]] }]);
    expect(book.Sheets.T.A1.v).toBe(long);
    expect(book.Sheets.T.B1.v).toBe('বাংলা');
    expect(book.Sheets.T.C1.v).toBe('a b');
    expect(book.Sheets.T.E1.v).toBe('after');
  });
  it('holds many rows, past the size where the file needs extra index sectors', async () => {
    const rows = Array.from({ length: 32000 }, (_, i) => [{ v: `row ${i} ${'y'.repeat(120)}` }, { v: i }]);
    const book = await readXls([{ name: 'Big', rows }]);
    expect(book.Sheets.Big.A32000.v).toContain('row 31999');
    expect(book.Sheets.Big.B32000.v).toBe(31999);
  }, 120000);
  it('every flow\'s real layout writes, for a second reader to check', async () => {
    const out = path.join(root, 'test-results', 'xls');
    mkdirSync(out, { recursive: true });
    for (const [flowId, list, detail] of [['tender_info', 'flow2/list', 'flow2/notice-works'], ['app_info', 'flow3/list', 'flow3/package-works'], ['contract_info', 'flow4/list', 'flow4/contract-new'], ['experience_info', 'flow5/list', 'flow5/experience-jvca']]) {
      const flow = profile.flows[flowId];
      const rows = flowRows(flowId, list, detail);
      const run = baseRun({ flowId, clusters: flow.detail.clusters.map((c) => c.id), expected: rows.length, stats: { rows: rows.length, detailTotal: rows.length, detailDone: rows.length, detailFailed: 0, refused: 0, multiLot: 0 } });
      const sheets = buildWorkbook({ flow, run, rows, toolVersion: '0.3.0', profileVersion: '1.2.0', siteHost: profile.site.host });
      const blob = buildXls(sheets);
      writeFileSync(path.join(out, `${flowId}.xls`), Buffer.from(await blob.arrayBuffer()));
      const book = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array' });
      expect(XLSX.utils.sheet_to_json(book.Sheets.Data)).toHaveLength(rows.length);
    }
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

  it('Flow 1: About and one sheet per budget, with the report\'s own rows and Total rows (D65)', async () => {
    const flow = profile.flows.procurement_transaction_report;
    const report = parseReport(doc(raw('flow1/report')), flow).rows;
    const rows = ['Office A', 'Office B'].flatMap((office, i) => report.map((r, seq) => ({ key: `${i}|${r.key}`, seq, list: { financial_year: '2024-2025', pe_office: office, project: 'Road Project', budget_type: r.budget, row_type: r.kind, label: r.label, ...r.values } })));
    const run = baseRun({ flowId: 'procurement_transaction_report', project: 'Road Project', scope: 'national', offices: [{}, {}], officeIndex: 2, shown: [{ label: 'Financial Year', value: '2024-2025' }, { label: 'PE Office', value: 'All offices' }, { label: 'Project', value: 'Road Project' }] });
    const book = await readBack(buildWorkbook({ flow, run, rows, toolVersion: '0.5.0', profileVersion: '1.4.0', siteHost: profile.site.host }));
    expect(book.SheetNames).toEqual(['About this grab', 'Development', 'Revenue', 'Own Fund']);
    const dev = XLSX.utils.sheet_to_json(book.Sheets.Development, { raw: true });
    expect(dev[0]).toMatchObject({ 'Financial Year': '2024-2025', Office: 'Office A', Project: 'Road Project', 'Method of Procurement': 'OTM(Goods)' });
    // With no project chosen, the column is still there and says so (D69).
    const bare = rows.map((r) => ({ ...r, list: { ...r.list, project: undefined } }));
    const plain = await readBack(buildWorkbook({ flow, run: { ...run, project: null }, rows: bare, toolVersion: '0.8.2', profileVersion: '1.5.0', siteHost: profile.site.host }));
    const first = XLSX.utils.sheet_to_json(plain.Sheets.Development, { raw: true })[0];
    expect(Object.keys(first).slice(0, 3)).toEqual(['Financial Year', 'Office', 'Project']);
    expect(first.Project).toBe('Not set');
    expect(dev.filter((r) => r['Method of Procurement'] === 'Total Development Budget')).toHaveLength(2);
    const headers = Object.keys(dev[0]);
    expect(headers.some((h) => h.includes('International'))).toBe(false);
    expect(headers.some((h) => h.includes('National'))).toBe(true);
    const own = XLSX.utils.sheet_to_json(book.Sheets['Own Fund'], { raw: true });
    // No grand total row (D72); each office keeps its Own Fund total.
    expect(own.some((r) => r['Method of Procurement'] === 'GRAND TOTAL')).toBe(false);
    expect(own.filter((r) => r['Method of Procurement'] === 'Total Own Fund').map((r) => r.Office)).toEqual(['Office A', 'Office B']);
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
    expect(name).toMatch(/^pdms_tender_info_\d{4}-\d{2}-\d{2}_\d{4}_partial\.xls$/);
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
