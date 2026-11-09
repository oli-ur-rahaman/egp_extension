// @ts-nocheck: run records and rows are free-form JSON. Covered by tests/unit/export.test.js.
// M9, M10: gives collected text its types, and lays out the workbook as agreed in docs/samples (D24-D26): About this grab, then Data.

import { colName } from './xlsx-writer.js';

const FILL = { filter: '548235', list: '1F3864', detail: '2E75B6', source: '7F7F7F', head: '1F3864', key: 'DDEBF7' };
const FORMAT = { datetime: 'dd-mmm-yyyy hh:mm', date: 'dd-mmm-yyyy', id: '@', number: '#,##0', money: '#,##0.000', moneyWithCurrency: '#,##0.000', percent: '0.000' };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WIDTH = { datetime: 17, date: 13, id: 16, number: 12, money: 15, moneyWithCurrency: 15, percent: 10, text: 22, yesNo: 9 };

/** dd-MMM-yyyy [HH:mm] as an Excel date, or null. @param {string} text */
export function excelDate(text) {
  const m = /^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec((text ?? '').trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0) return null;
  const ms = Date.UTC(Number(m[3]), month, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0));
  return ms / 86400000 + 25569;
}

/** @param {string} text */
export function excelNumber(text) {
  const t = (text ?? '').replace(/,/g, '').trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

/**
 * Text to a typed value. Anything that doesn't fit its type stays as the portal wrote it; nothing is thrown away.
 * A value the portal marks N.A. is empty. IDs stay text, so leading zeros survive.
 * @param {string} type @param {string} raw
 */
export function typed(type, raw) {
  const text = (raw ?? '').trim();
  if (text === '' || /^n\.?\/?a\.?$/i.test(text)) return null;
  if (type === 'date' || type === 'datetime') return excelDate(text) ?? text;
  if (type === 'number' || type === 'money' || type === 'percent') return excelNumber(text) ?? text;
  if (type === 'moneyWithCurrency') return excelNumber(text.replace(/\(.*\)\s*$/, '')) ?? text;
  return text;
}

/** @param {string} raw "999999.999 (BDT)" */
export const currencyOf = (raw) => /\(([^)]+)\)\s*$/.exec(raw ?? '')?.[1] ?? null;

/** The Data sheet's columns, in order. */
export function columnsFor(flow, run) {
  const columns = [];
  for (const item of run.shown) columns.push({ group: 'filter', header: `Filter: ${item.label}`, type: 'text', width: 16, value: () => item.value });
  if (flow.report) {
    const basics = [['Office', 'office', 26], ['Budget Type', 'budget_type', 12], ['Row Type', 'row_type', 13], ['Method', 'method', 10], ['Procurement Nature', 'nature', 12]];
    for (const [header, key, width] of basics) columns.push({ group: 'list', header, key, type: 'text', width, value: (row) => row.list[key] });
    for (const c of flow.report.columns.filter((x) => x.key !== 'method_label')) columns.push({ group: 'list', header: c.header, key: c.key, type: c.type, width: 12, value: (row) => row.list[c.key] });
  } else {
    const isChosen = (field) => (run.chosen ? run.chosen.includes(field.id) : run.clusters.includes(field.cluster));
    const preferred = new Map(flow.detail.fields.filter((f) => f.sameAs && f.prefer === 'detail' && run.clusters.includes(f.cluster)).map((f) => [f.sameAs, f.id]));
    for (const column of flow.list.columns) {
      for (const part of column.parts) {
        const better = preferred.get(part.key);
        columns.push({ group: 'list', header: part.header, key: part.key, type: part.type, width: WIDTH[part.type] ?? 22, value: (row) => (better && row.detail?.[better]) || row.list[part.key] });
      }
    }
    const taken = new Set(columns.map((c) => c.header));
    for (const field of flow.detail.fields) {
      if (field.sameAs || !isChosen(field)) continue;
      const header = taken.has(field.header) ? `Notice: ${field.header}` : field.header;
      taken.add(header);
      columns.push({ group: 'detail', header, key: field.id, type: field.type === 'moneyWithCurrency' ? field.type : field.type, width: WIDTH[field.type] ?? 22, value: (row) => row.detail?.[field.id] });
      if (field.type === 'moneyWithCurrency') columns.push({ group: 'detail', header: 'Currency', type: 'text', width: 9, value: (row) => currencyOf(row.detail?.[field.id]) });
    }
    if (run.clusters.length) columns.push({ group: 'source', header: 'Detail page', type: 'text', width: 11, value: (row) => ({ ok: 'Read', refused: 'Refused by portal', failed: "Couldn't read" }[row.outcome] ?? 'Not reached') });
  }
  columns.push({ group: 'source', header: 'Grabbed at', type: 'datetime', width: 17, value: () => run.grabbedText });
  columns.push({ group: 'source', header: 'Login state', type: 'text', width: 12, value: () => (run.loggedIn ? 'Logged in' : 'Logged out') });
  return columns;
}

/** Whether the file can be called complete, in plain words. */
export function verdictOf(flow, run, rowCount) {
  if (run.status === 'stopped') return { complete: false, text: 'Partial: stopped before the end. This file holds what was collected.' };
  if (run.status !== 'finished') return { complete: false, text: 'Partial: the run has not finished. This file holds what was collected so far.' };
  const short = (run.expected ?? 0) - rowCount;
  if (!flow.report && short > 0) return { complete: false, text: `${short.toLocaleString('en-US')} rows short of the portal's total, after a second search. New or moved rows on the portal can cause this.` };
  if (run.stats.detailFailed > 0) return { complete: false, text: `All rows collected, but ${run.stats.detailFailed.toLocaleString('en-US')} detail pages couldn't be read. Their rows are marked in the Detail page column.` };
  return { complete: true, text: 'Complete' };
}

const dateText = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${MONTHS[d.getMonth()].replace(/^./, (c) => c.toUpperCase())}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const lasted = (ms) => {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'under a minute';
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

/**
 * Flow 1 (D65): About, then one sheet per budget, each with e-GP's own rows in e-GP's order, Total rows included.
 * The year, office and project of each report are columns of their own.
 * @returns {import('./xlsx-writer.js').Sheet[]}
 */
export function buildReportWorkbook({ flow, run, rows, toolVersion, profileVersion, siteHost }) {
  const finished = run.finishedAt ?? Date.now();
  const grabbed = dateText(finished);
  const shownOf = (label) => run.shown.find((x) => x.label === label)?.value;
  const scope = run.scope ?? 'all';
  const inScope = (c) => scope === 'all' || !/_(national|international)$/.test(c.key) || c.key.endsWith(`_${scope}`);
  const columns = [
    { group: 'filter', header: 'Financial Year', type: 'text', width: 12, value: (row) => row.list.financial_year ?? shownOf('Financial Year') },
    { group: 'filter', header: 'Office', type: 'text', width: 28, value: (row) => row.list.pe_office ?? row.list.office },
    ...(rows.some((r) => r.list.project) ? [{ group: 'filter', header: 'Project', type: 'text', width: 28, value: (row) => row.list.project ?? '' }] : []),
    { group: 'list', header: flow.report.columns.find((c) => c.key === 'method_label')?.header ?? 'Method of Procurement', type: 'text', width: 22, value: (row) => row.list.label ?? (row.list.method ? `${row.list.method}(${row.list.nature})` : row.list.row_type) },
    ...flow.report.columns.filter((c) => c.key !== 'method_label' && inScope(c)).map((c) => ({ group: 'list', header: c.header, key: c.key, type: c.type, width: 13, value: (row) => row.list[c.key] })),
    { group: 'source', header: 'Grabbed at', type: 'datetime', width: 17, value: () => grabbed },
    { group: 'source', header: 'Login state', type: 'text', width: 12, value: () => (run.loggedIn ? 'Logged in' : 'Logged out') },
  ];
  const head = columns.map((c) => ({ v: c.header, s: { bold: true, color: 'FFFFFF', fill: FILL[c.group], border: true, wrap: true, h: 'center', v: 'center' } }));
  const lastTable = flow.report.tables.at(-1).budgetType;
  // The grand total sits at the end of the last table on the page, so it goes on that sheet.
  const sheetOf = (row) => (row.list.row_type === 'Grand Total' ? lastTable : row.list.budget_type);
  const chosenTables = flow.report.tables.filter((t) => !run.tables || run.tables.includes(t.budgetType));
  const numberColumns = columns.filter((c) => c.key && c.type !== 'text');
  // D68: a row whose every number is zero or blank is left out when the user asked for rows with a number only.
  const hasNumber = (row) => numberColumns.some((c) => Number(row.list[c.key]) !== 0 && row.list[c.key] !== '' && row.list[c.key] !== undefined && !Number.isNaN(Number(row.list[c.key])));
  const kept = run.rowsMode === 'nonzero' ? rows.filter(hasNumber) : rows;
  const counts = {};
  const sheets = chosenTables.map((table) => {
    const own = kept.filter((row) => sheetOf(row) === table.budgetType);
    counts[table.budgetType] = own.length;
    const body = own.map((row) => {
      const isTotal = row.list.row_type !== 'Method';
      return columns.map((c) => {
        const v = typed(c.type, c.value(row));
        const format = FORMAT[c.type];
        return { v, s: { border: true, v: 'top', ...(isTotal ? { bold: true, fill: FILL.key } : {}), ...(format && typeof v === 'number' ? { format } : {}) } };
      });
    });
    return { name: table.budgetType, widths: columns.map((c) => c.width), rows: [head, ...body], heights: { 0: 62 }, freeze: true, filter: `A1:${colName(columns.length - 1)}${Math.max(body.length + 1, 1)}` };
  });

  const about = [];
  const merges = [];
  const heights = {};
  const title = (text, size = 11) => {
    const r = about.length;
    about.push([{ v: text, s: { bold: true, size, color: 'FFFFFF', fill: FILL.head } }, { s: { fill: FILL.head } }, { s: { fill: FILL.head } }, { s: { fill: FILL.head } }]);
    merges.push(`A${r + 1}:D${r + 1}`);
  };
  const kv = (k, v) => about.push([{ v: k, s: { bold: true, fill: FILL.key, border: true, wrap: true, v: 'top' } }, { v, s: { border: true, wrap: true, v: 'top', h: 'left' } }]);
  const para = (text, height = 30) => {
    const r = about.length;
    about.push([{ v: text, s: { wrap: true, v: 'top' } }]);
    merges.push(`A${r + 1}:D${r + 1}`);
    heights[r] = height;
  };
  title(flow.name, 14);
  about.push([]);
  title('What was done');
  para(run.project
    ? 'Generated the report once for each financial year, office and project chosen, and kept the rows of the tables chosen.'
    : 'Generated the report once for each financial year and office chosen, and kept the rows of the tables chosen.', 44);
  about.push([]);
  title('The grab');
  kv('Portal', `e-GP Bangladesh, ${siteHost.replace(/^www\./, '')}`);
  kv('Report page', flow.name);
  kv('Started', dateText(run.startedAt));
  kv('Finished', run.finishedAt ? dateText(run.finishedAt) : 'Not finished');
  kv('Time taken', lasted(finished - run.startedAt));
  kv('Login state', run.loggedIn ? 'Logged in' : 'Logged out');
  kv('Interruptions', run.interruptions.length ? `${run.interruptions.length}, each resumed. No data lost.` : 'None');
  kv('Tool / rules version', `PDMS eGP Extractor ${toolVersion} / site rules ${profileVersion}`);
  about.push([]);
  title('Search criteria');
  for (const item of run.shown) if (item.value !== '-') kv(item.label, item.value);
  kv('Columns', { all: 'National and International', national: 'National only', international: 'International only' }[scope]);
  kv('Tables', chosenTables.map((t) => t.budgetType).join(', '));
  kv('Rows', run.rowsMode === 'nonzero' ? `Only rows with a number: ${rows.length - kept.length} rows of zeros left out` : 'All rows, as the report shows them');
  about.push([]);
  title('Is it complete?');
  kv('Reports in this grab / made', `${run.offices?.length ?? 0} / ${run.officeIndex}`);
  kv('Reports with no rows', String(run.stats.emptyReports ?? 0));
  for (const table of chosenTables) kv(`Rows on the ${table.budgetType} sheet`, String(counts[table.budgetType]));
  kv('Verdict', verdictOf(flow, run, rows.length).text);
  about.push([]);
  title('Good to know about this file');
  para("Each sheet keeps the report's own rows, in the portal's order, with its Total rows. Totals are in bold.");
  para('To add up, filter Method of Procurement first and leave out the Total rows, or totals count twice.');
  para('Amounts are in Crore BDT, as on the portal. A value the portal shows as N.A. is empty.');
  return [{ name: 'About this grab', widths: [34, 58, 16, 18], rows: about, merges, heights, hideGrid: true }, ...sheets];
}

/** @returns {import('./xlsx-writer.js').Sheet[]} */
export function buildWorkbook({ flow, run, rows, toolVersion, profileVersion, siteHost }) {
  if (flow.report) return buildReportWorkbook({ flow, run, rows, toolVersion, profileVersion, siteHost });
  const finished = run.finishedAt ?? Date.now();
  const withText = { ...run, grabbedText: dateText(finished) };
  const columns = columnsFor(flow, withText);
  const box = { border: true, v: 'top' };

  // --- Data
  const dataRows = [columns.map((c) => ({ v: c.header, s: { bold: true, color: 'FFFFFF', fill: FILL[c.group], border: true, wrap: true, h: 'center', v: 'center' } }))];
  for (const row of rows) {
    dataRows.push(columns.map((c) => {
      const raw = c.value(row);
      const v = typed(c.type, raw);
      const format = FORMAT[c.type];
      const isNumber = typeof v === 'number';
      return { v, s: { ...box, ...(format && (isNumber || c.type === 'id') ? { format } : {}) } };
    }));
  }
  const lastRow = dataRows.length;
  const lastCol = colName(columns.length - 1);
  const data = { name: 'Data', widths: columns.map((c) => c.width), rows: dataRows, heights: { 0: 62 }, freeze: true, filter: `A1:${lastCol}${Math.max(lastRow, 1)}` };
  const range = (key) => {
    const at = columns.findIndex((c) => c.key === key);
    return at < 0 ? null : `Data!$${colName(at)}$2:$${colName(at)}$${Math.max(lastRow, 2)}`;
  };

  // --- About
  const about = [];
  const merges = [];
  const heights = {};
  const title = (text, size = 11) => {
    const r = about.length;
    about.push([{ v: text, s: { bold: true, size, color: 'FFFFFF', fill: FILL.head } }, { s: { fill: FILL.head } }, { s: { fill: FILL.head } }, { s: { fill: FILL.head } }]);
    merges.push(`A${r + 1}:D${r + 1}`);
  };
  const gap = () => about.push([]);
  const kv = (k, v, format) => about.push([
    { v: k, s: { bold: true, fill: FILL.key, border: true, wrap: true, v: 'top' } },
    { v, s: { border: true, wrap: true, v: 'top', h: 'left', ...(format ? { format } : {}) } },
  ]);
  const para = (text, height = 30) => {
    const r = about.length;
    about.push([{ v: text, s: { wrap: true, v: 'top' } }]);
    merges.push(`A${r + 1}:D${r + 1}`);
    heights[r] = height;
  };
  const verdict = verdictOf(flow, run, rows.length);

  title(flow.name, 14);
  gap();
  title('What was done');
  para(flow.report
    ? 'Generated the report for your financial year, once for each office, and collected every row of its three budget tables into one flat table.'
    : run.clusters.length
      ? 'Searched e-GP with your filters, went through every result page, opened each row\'s detail page, collected the fields you ticked, and joined them into one row each.'
      : 'Searched e-GP with your filters and went through every result page. No detail pages were opened, because no fields were ticked.', 44);
  gap();
  title('The grab');
  kv('Portal', `e-GP Bangladesh, ${siteHost.replace(/^www\./, '')}`);
  kv('Report page', flow.name);
  kv('Started', dateText(run.startedAt));
  kv('Finished', run.finishedAt ? dateText(run.finishedAt) : 'Not finished');
  kv('Time taken', lasted(finished - run.startedAt));
  kv('Login state', run.loggedIn ? 'Logged in' : flow.login.startWarning ? 'Logged out. LTM and some other methods are not listed on this page when logged out.' : 'Logged out');
  kv('Interruptions', run.interruptions.length ? `${run.interruptions.length}, each resumed. No data lost.` : 'None');
  kv('Tool / rules version', `PDMS eGP Extractor ${toolVersion} / site rules ${profileVersion}`);
  gap();
  title('Filter conditions you set');
  for (const item of run.shown) if (item.value !== '-') kv(item.label, item.value);
  gap();
  if (flow.detail) {
    title('Detail-page fields you chose (checkerboard)');
    const inCluster = (id) => flow.detail.fields.filter((f) => f.cluster === id && !f.sameAs);
    const isOn = (f) => (run.chosen ? run.chosen.includes(f.id) : run.clusters.includes(f.cluster));
    for (const cluster of flow.detail.clusters) {
      const fields = inCluster(cluster.id);
      if (!fields.length) continue;
      const on = fields.filter(isOn);
      kv(cluster.name, on.length === 0 ? 'None' : on.length === fields.length ? `All ${fields.length} fields` : on.map((f) => f.header).join(', '));
    }
    gap();
  }
  title('Is it complete?');
  if (flow.report) {
    kv('Offices in the search / reports collected', `${run.offices?.length ?? 0} / ${run.officeIndex}`);
  } else {
    kv("Portal's total for this search", run.expected ?? '', FORMAT.number);
    kv('Different records collected', rows.length, FORMAT.number);
    if (run.sweep > 1) kv('Second search', 'Run once to find rows the portal hides between pages.');
    if (run.clusters.length) kv('Detail pages read / refused by portal / failed', `${run.stats.detailDone} / ${run.stats.refused} / ${run.stats.detailFailed}`);
    if (run.stats.multiLot) kv('Rows with more than one lot', `${run.stats.multiLot}. All their lots are kept, joined in one cell.`);
    if (run.unknownLabels.length) kv('Labels on the portal the tool does not know yet', run.unknownLabels.join('; '));
  }
  kv('Verdict', verdict.text);
  gap();
  title('Findings at a glance');
  const firstList = columns.find((c) => c.group === 'list');
  const firstColumn = colName(columns.indexOf(firstList));
  about.push([{ v: 'Rows in Data', s: { bold: true, fill: FILL.key, border: true } }, { v: rows.length, f: `COUNTA(Data!$${firstColumn}$2:$${firstColumn}$${Math.max(lastRow, 2)})`, s: { border: true, h: 'left', format: FORMAT.number } }]);
  gap();
  const keyStats = flow.statistics ?? (flow.report ? [{ title: 'Rows by office', by: 'office' }, { title: 'Rows by type', by: 'row_type' }] : []);
  for (const stat of keyStats) {
    const byRange = range(stat.by);
    if (!byRange) continue;
    const sumColumn = stat.sum ? columns.find((c) => c.key === stat.sum) : null;
    const sumRange = stat.sum ? range(stat.sum) : null;
    const head = { bold: true, fill: FILL.key, border: true };
    const r = about.length;
    about.push([{ v: stat.title, s: head }, { s: head }, { v: 'Rows', s: head }, { v: sumColumn?.header ?? '', s: head }]);
    merges.push(`A${r + 1}:B${r + 1}`);
    const tally = new Map();
    for (const row of rows) {
      const column = columns.find((c) => c.key === stat.by);
      const name = column.value(row);
      if (!name) continue;
      const entry = tally.get(name) ?? { count: 0, sum: 0 };
      entry.count += 1;
      if (sumColumn) {
        const n = typed(sumColumn.type, sumColumn.value(row));
        if (typeof n === 'number') entry.sum += n;
      }
      tally.set(name, entry);
    }
    for (const [name, entry] of [...tally].sort((a, b) => b[1].count - a[1].count)) {
      const line = about.length + 1;
      about.push([
        { v: name, s: { border: true, wrap: true, v: 'top' } }, { s: { border: true } },
        { v: entry.count, f: `COUNTIF(${byRange},A${line})`, s: { border: true } },
        sumRange ? { v: entry.sum, f: `SUMIF(${byRange},A${line},${sumRange})`, s: { border: true, format: FORMAT.money } } : null,
      ]);
      merges.push(`A${line}:B${line}`);
    }
    gap();
  }
  title('Good to know about this file');
  para('Every row has the filters you set in the green columns, so a row can be traced to its search even if files are merged.');
  para('Headers: green = filter you set; dark blue = list table; light blue = the detail page, only those you ticked; grey = source.');
  para('IDs are text, so leading zeros survive. Dates sort as dates. Amounts add up. A value the portal leaves blank or marks N.A. is empty.');
  if (flow.report) para('Total rows are kept and marked in Row Type. Filter Row Type to Method before adding up, or totals count twice.');
  if (flow.id === 'contract_info' || flow.number === 4) para('Value (Crore BDT) comes from the list, in Crore. Contract Price comes from the detail page, in full units, with its currency beside it.');

  return [
    { name: 'About this grab', widths: [34, 58, 16, 18], rows: about, merges, heights, hideGrid: true },
    data,
  ];
}

/** pdms_<flow>_<yyyy-mm-dd_hhmm>.xls, marked when partial (M10-T05, T06, D54). */
export function fileName(flow, run, flowId, extension = 'xls') {
  const d = new Date(run.finishedAt ?? Date.now());
  const p = (n) => String(n).padStart(2, '0');
  const partial = run.status === 'finished' ? '' : '_partial';
  return `pdms_${flowId}_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${partial}.${extension}`;
}
