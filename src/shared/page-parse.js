// @ts-nocheck: reads the portal's pages as the Site Profile describes them. Proven on saved pages in tests/unit/page-parse.test.js.
// Turns a list, detail or report page into plain values. Holds no portal knowledge. Values stay as text here; export.js gives them types.

import { isVisible } from './page-read.js';
import { classifyLabel, normaliseLabel } from './profile.js';

const clean = (text) => (text ?? '').replace(/\s+/g, ' ').trim();
const trimComma = (text) => clean(text).replace(/,$/, '').trim();
const TRAILING_DATE = /(\d{2}-[A-Za-z]{3}-\d{4}(?: \d{2}:\d{2})?)$/;

/** A cell's lines. Only a line break directly in the cell splits it: a title can hold its own markup. */
function linesOf(cell) {
  const lines = [''];
  for (const node of cell.childNodes) {
    if (node.nodeName === 'BR') lines.push('');
    else if (node.nodeName === 'INPUT') continue;
    else lines[lines.length - 1] += ` ${node.textContent ?? ''}`;
  }
  return lines.map(trimComma).filter((l) => l !== '');
}

/** One query value from a link's address. Addresses here are relative, so a dummy base is used only to read them. */
function linkParam(anchor, name) {
  if (!anchor) return '';
  const href = anchor.getAttribute('href') ?? '';
  return new URL(href, 'http://x/').searchParams.get(name) ?? '';
}

function splitComma(line) {
  if (line.trim() === '-' || line.trim() === '') return { before: '', after: '' };
  const at = line.indexOf(',');
  const before = at < 0 ? line : line.slice(0, at);
  // The ID is digits, or '-' or absent on manually entered records.
  if (/^\d+$/.test(before.trim())) return { before: before.trim(), after: at < 0 ? '' : clean(line.slice(at + 1)) };
  return { before: '', after: before.trim() === '-' ? clean(line.slice(at + 1)) : clean(line) };
}

function partValue(part, lines, anchor) {
  const { index } = part;
  // A cell can start with its link, with no ID line before it: then line 0 is the title, not an ID and reference.
  const linkText = anchor ? clean(anchor.textContent) : null;
  const startsWithTitle = linkText && lines[0] === linkText && !/^\d+\s*,/.test(linkText);
  if (startsWithTitle && typeof index === 'string' && /^0:/.test(index)) return '';
  if (startsWithTitle && typeof index === 'number' && index >= 1) return index === 1 ? linkText : '';
  if (typeof index === 'number') return lines[index < 0 ? lines.length + index : index] ?? '';
  if (index === 'middle') return lines.slice(1, -1).join('; ');
  if (index.startsWith('link:')) return linkParam(anchor, index.slice(5));
  const [at, how] = index.split(':');
  const line = lines[Number(at)] ?? '';
  if (how === 'beforeComma') return splitComma(line).before;
  if (how === 'afterComma') return splitComma(line).after;
  if (how === 'trailingDate') return TRAILING_DATE.exec(line)?.[1] ?? '';
  if (how === 'beforeDate') return clean(line.replace(TRAILING_DATE, ''));
  return '';
}

/** How to open this row's detail page, read from the row. */
function openParams(row, flow) {
  if (!flow.detail) return null;
  const out = { ...flow.detail.open.fixed };
  const anchor = linkIn(row, flow);
  for (const param of flow.detail.open.params) {
    out[param.name] = param.from === 'link' ? linkParam(anchor, param.name) : row.querySelector(param.from)?.value ?? '';
  }
  return out;
}

function linkIn(row, flow) {
  const column = flow.list.columns.find((c) => c.linkSelector);
  return column ? row.querySelector(column.linkSelector) : null;
}

/**
 * Reads one list answer.
 * @returns {{ rows: { key: string, values: Record<string, string>, open: any }[], totalPages: number | null, empty: boolean }}
 */
export function parseList(doc, flow) {
  const { list, naturalKey } = flow;
  if (doc.querySelector(list.empty.selector)) return { rows: [], totalPages: 0, empty: true };
  const rows = [];
  for (const row of doc.querySelectorAll(list.rows)) {
    const cells = [...row.children].filter((c) => c.tagName === 'TD');
    if (!cells.length) continue; // a header row inside the table's body (insight 75)
    const values = {};
    for (const column of list.columns) {
      const cell = cells[column.cell - 1];
      if (!cell) continue;
      const anchor = column.linkSelector ? cell.querySelector(column.linkSelector) : null;
      const lines = column.split === 'none' ? [trimComma(cell.textContent)] : linesOf(cell);
      for (const part of column.parts) values[part.key] = partValue(part, lines, anchor);
    }
    if (naturalKey.whenMissing && !values[naturalKey.key]) values[naturalKey.key] = naturalKey.whenMissing;
    const key = values[naturalKey.storeKey ?? naturalKey.key] || clean(row.textContent);
    rows.push({ key, values, open: openParams(row, flow) });
  }
  const total = doc.querySelector(list.totalPages);
  const totalPages = total ? Number(total.value ?? total.getAttribute('value')) : null;
  return { rows, totalPages: Number.isFinite(totalPages) ? totalPages : null, empty: false };
}

/** The rows of the table a cell sits in, not those of any table inside it. */
function rowsOfTable(table) {
  return [...table.children].flatMap((section) => (section.tagName === 'TR' ? [section] : [...section.children]));
}

const visibleCells = (row) => [...row.children].filter((c) => isVisible(c));

/** The values under a column heading, one per row below it. */
function valuesUnder(cell) {
  const row = cell.parentElement;
  const table = cell.closest('table');
  const index = visibleCells(row).indexOf(cell);
  const rows = rowsOfTable(table);
  return rows.slice(rows.indexOf(row) + 1)
    .filter((r) => isVisible(r))
    .map((r) => clean(visibleCells(r)[index]?.textContent))
    .filter((text) => text !== '' && !/^no records? found/i.test(text));
}

/** The value beside a label. */
function valueBeside(cell) {
  for (let next = cell.nextElementSibling; next; next = next.nextElementSibling) {
    if (!isVisible(next)) continue;
    return clean(next.textContent);
  }
  return '';
}

/**
 * Reads a detail page: every field found, and labels never seen before. A missing label is an empty field, never a failure.
 * @returns {{ values: Record<string, string>, unknown: string[], lots: number }}
 */
export function parseDetail(doc, flow) {
  const collected = {};
  const unknown = [];
  const cells = [...doc.querySelectorAll(flow.detail.labelCell), ...doc.querySelectorAll('th')];
  for (const cell of cells) {
    if (!isVisible(cell)) continue;
    const label = normaliseLabel(clean(cell.textContent));
    if (!label) continue;
    const got = classifyLabel(flow, label);
    if (!got) {
      if (!unknown.includes(label)) unknown.push(label);
      continue;
    }
    if (!got.field) continue;
    const isHeading = cell.tagName === 'TH';
    const found = isHeading ? valuesUnder(cell) : [valueBeside(cell)];
    const many = got.field.type === 'table' || got.field.type === 'repeatedBlock';
    (collected[got.field.id] ??= []).push(...found.filter(Boolean).map((v) => (many ? `${label}: ${v}` : v)));
  }
  const values = Object.fromEntries(Object.entries(collected).map(([id, list]) => [id, [...new Set(list)].join('; ')]));
  // One tender has one lot so far (D14). Should one ever show more, all of them are kept, and the row is flagged.
  const lotField = flow.detail.fields.find((f) => f.id === 'lot_no');
  const lots = lotField ? collected[lotField.id]?.length ?? 0 : 0;
  return { values, unknown, lots };
}

/** A percentage the page works out in the browser, so it isn't in the raw answer (insight 30). */
function percentOf(column, row) {
  const m = /^col(\d+)\/col(\d+)\*100$/.exec(column.formula ?? '');
  if (!m) return '';
  const top = Number(row[`col${m[1]}`]);
  const bottom = Number(row[`col${m[2]}`]);
  return bottom > 0 ? String(Math.round((top / bottom) * 100000) / 1000) : '';
}

/**
 * Reads the report's tables into flat rows: one per method, one per budget total, and a grand total.
 * @returns {{ rows: any[] }}
 */
export function parseReport(doc, flow) {
  const { report } = flow;
  const pattern = new RegExp(report.methodLabelPattern);
  const cols = report.columns.filter((c) => c.key !== 'method_label');
  const text = (id) => clean(doc.getElementById(id)?.textContent);
  const number = (raw) => (raw === report.notApplicableText ? '' : raw);
  const rows = [];
  const grand = {};
  for (const table of report.tables) {
    const sums = {};
    const lineCell = (col, row) => report.cell.replace('{table}', table.number).replace('{col}', col).replace('{row}', row);
    for (let r = 1; doc.getElementById(lineCell(2, r)); r++) {
      const label = text(lineCell(2, r));
      const m = pattern.exec(label);
      const raw = Object.fromEntries(cols.map((c) => [`col${c.col}`, number(text(lineCell(c.col, r)))]));
      const values = {};
      for (const c of cols) values[c.key] = c.formula ? percentOf(c, raw) : raw[`col${c.col}`];
      for (const c of cols) if (!c.formula) sums[`col${c.col}`] = (sums[`col${c.col}`] ?? 0) + (Number(raw[`col${c.col}`]) || 0);
      rows.push({ key: `${table.number}.${r}`, kind: 'Method', label, budget: table.budgetType, method: m?.groups?.method?.trim() ?? label, nature: m?.groups?.nature?.trim() ?? '', values });
    }
    // Totals: the page's own cell where it has one, otherwise the sum of the rows above it. Cell t1total1 is column 3.
    const values = {};
    const raw = {};
    for (const c of cols) {
      if (c.formula) continue;
      const shown = number(text(report.totalCell.replace('{table}', table.number).replace('{col}', c.col - 2)));
      raw[`col${c.col}`] = shown !== '' ? shown : String(sums[`col${c.col}`] ?? 0);
      grand[`col${c.col}`] = (grand[`col${c.col}`] ?? 0) + (Number(raw[`col${c.col}`]) || 0);
    }
    for (const c of cols) values[c.key] = c.formula ? percentOf(c, raw) : raw[`col${c.col}`];
    rows.push({ key: `${table.number}.total`, kind: 'Budget Total', label: table.totalLabel, budget: table.budgetType, method: '', nature: '', values });
  }
  const values = {};
  const raw = Object.fromEntries(Object.entries(grand).map(([k, v]) => [k, String(Math.round(v * 1000) / 1000)]));
  for (const c of cols) values[c.key] = c.formula ? percentOf(c, raw) : raw[`col${c.col}`];
  rows.push({ key: 'grand', kind: 'Grand Total', label: report.tables.find((t) => t.grandTotalLabel)?.grandTotalLabel ?? 'Grand Total', budget: 'All', method: '', nature: '', values });
  return { rows };
}
