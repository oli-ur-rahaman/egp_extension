// @ts-nocheck
// M1-T07: makes a safe copy of a captured page, for tests in this public repo. Default deny: every piece of text is masked
// unless it is a label, a standard term, a date or a plain number. Scripts, comments and event handlers are removed.
// This applies to test copies only, never to the tool's Excel output (D40).

import { Window } from 'happy-dom';

const STANDARD_TERMS = new Set([
  'Goods', 'Works', 'Service', 'Services', 'Physical Services', 'NCT', 'ICT',
  'RFQ', 'OTM', 'LTM', 'TSTM', 'QCBS', 'LCS', 'SFB', 'DC', 'SBCQ', 'SSS', 'IC', 'CSO', 'DPM', 'OSTETM', 'RFQU', 'RFQL',
  'TENDER', 'REOI', 'PQ', 'RFP', 'RFA', 'PPS', 'Tender - Single Lot', 'Package wise', 'Lot wise', 'Single',
  'Open Tendering Method (OTM)', 'Limited Tendering Method (LTM)', 'Request For Quotation (RFQ)',
  'Live', 'Archive', 'Archived', 'Cancelled', 'Being processed', 'Contract Awarded', 'Re-Tendered', 'Rejected', 'Completed', 'Ongoing',
  'Development', 'Revenue', 'Own Fund', 'Own fund', 'Government', 'Aid or Grant', 'Yes', 'No', 'Not applicable', 'N.A.', 'BDT', 'USD',
  'Payment through Bank', 'No Record Found.', 'No Record Found!', 'No Records Found', 'No records found', 'eTenders', 'eCMS', 'Manual', 'All',
  'Address', 'City', 'Thana', 'District', 'Country', 'Phone No', 'Fax No', 'Download', 'Documents', 'Print', 'Search', 'Reset', 'Logout',
  'Page', 'of', 'First', 'Previous', 'Next', 'Last', 'Go To Page',
]);
const LOOKS_STANDARD = [
  /^\d{2}-[A-Z][a-z]{2}-\d{4}( \d{2}:\d{2})?$/, // dates
  /^\d{4}-\d{4}$/, // financial years
  /^[A-Z]+\((Goods|Works|Service|Physical Services)\)$/, // Flow 1 method labels
  /^(Total .{3,30}|GRAND TOTAL)$/,
  /^Amendment\/Corrigendum issued : \d+$/,
];
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /\+?\b0\d{1,4}[\s-]?\d{6,}\b|\b01[3-9]\d{8}\b/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
// Labels and headings, identified by the page's own markup.
const LABEL_MARKUP = 'td.ff, th, .ff, .pageHead_1, .tableHead_1, .tableHead_22, option';
const RECORD_LINK = /(^|\/)(ViewTender|ViewPackageDetail|ViewAwardedContracts|VieweCmsDetails)\.jsp/;
const SAFE_HIDDEN_NAMES = /^(id|h|viewType|pageNo|size|totalPages|cntTenBrief|statusTab|totalValue|totalTender)$/;

/** Same shape, no content: "Xxxxx. Xxx, 99-X" keeps word lengths and punctuation, so parsers still have something real to split. */
function maskWords(text) {
  return text.replace(/[A-Z]/g, 'X').replace(/[a-z]/g, 'x').replace(/\d/g, '9').replace(/@/g, 'x').replace(/[^\s\x20-\x7e]/g, 'x');
}

export function maskText(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return text;
  const core = t.replace(/[,;]$/, '').trim();
  if (STANDARD_TERMS.has(core) || LOOKS_STANDARD.some((re) => re.test(core))) return text;
  if (PLAIN_NUMBER.test(core) && !PHONE.test(core)) return text;
  return maskWords(text);
}

const isLabelText = (t) => /:\s*$/.test(t) && t.length <= 90 && !/\d/.test(t);

function cleanText(doc) {
  const walker = doc.createTreeWalker(doc.documentElement, 4 /* text */);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || parent.closest('title')) continue;
    const t = node.textContent;
    const keep = parent.closest(LABEL_MARKUP) || isLabelText(t.trim());
    node.textContent = keep && !EMAIL.test(t) && !PHONE.test(t) ? t : maskText(t);
  }
}

function cleanAttributes(doc) {
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      else if (['title', 'alt', 'placeholder', 'content'].includes(name)) el.setAttribute(attr.name, maskText(attr.value));
      else if (EMAIL.test(attr.value) || PHONE.test(attr.value)) el.setAttribute(attr.name, maskWords(attr.value));
    }
    if (el.tagName === 'A' && el.hasAttribute('href')) {
      const href = el.getAttribute('href');
      // Row links keep their public IDs. Any other link can carry an account's ID, so its values go.
      if (!RECORD_LINK.test(href) && href.includes('?')) el.setAttribute('href', href.replace(/=[^&]*/g, '='));
    }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      const name = el.getAttribute('name') || el.getAttribute('id') || '';
      if (type === 'button' || type === 'submit') continue;
      const value = el.getAttribute('value') || '';
      if (type === 'hidden' && SAFE_HIDDEN_NAMES.test(name)) continue;
      if (value) el.setAttribute('value', PLAIN_NUMBER.test(value) && value.length <= 4 ? value : '');
      if (el.tagName === 'TEXTAREA') el.textContent = '';
    }
  }
}

/** Done on the text, before parsing: one Flow 1 dropdown holds 11,000+ options, too many for the parser's memory. */
function trimBeforeParsing(html, maxOptions) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(<select\b[^>]*>)([\s\S]*?)(<\/select>)/gi, (_, open, body, close) => {
      const options = body.match(/<option\b[\s\S]*?(?=<option\b|$)/gi) ?? [];
      return open + options.slice(0, maxOptions).join('') + close;
    });
}

function removeComments(doc) {
  const walker = doc.createTreeWalker(doc.documentElement, 128 /* comment */);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  for (const n of nodes) n.remove();
}

/**
 * Cleans one page or fragment. Throws if anything still looks like an email or a phone number.
 * @param {string} html
 * @param {{ fragment?: boolean, maxOptions?: number }} [options]
 * @returns {string}
 */
export function sanitise(html, { fragment = false, maxOptions = 300 } = {}) {
  const window = new Window();
  const doc = window.document;
  const trimmed = trimBeforeParsing(html, maxOptions);
  doc.write(fragment ? `<!doctype html><html><body><table id="f"><tbody>${trimmed}</tbody></table></body></html>` : trimmed);
  for (const el of doc.querySelectorAll('script, noscript, style, link, iframe, object, embed, meta[http-equiv="refresh"]')) el.remove();
  removeComments(doc);
  cleanText(doc);
  cleanAttributes(doc);
  // A parser moves inputs out of a table, so a list's page count ends up beside it. Put it back with the rows.
  const beside = fragment ? [...doc.body.children].filter((el) => el.id !== 'f').map((el) => el.outerHTML).join('') : '';
  const out = fragment ? doc.querySelector('#f > tbody').innerHTML + beside : `<!doctype html>\n${doc.documentElement.outerHTML}`;
  window.close();
  const leak = out.match(EMAIL) || out.match(PHONE);
  if (leak) throw new Error(`Cleaned page still holds something like "${maskWords(leak[0])}"`);
  return out;
}
