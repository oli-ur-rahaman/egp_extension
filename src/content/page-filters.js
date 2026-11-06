// D18: reads a report page's filters and applies changes to the page itself. No option list is stored anywhere.
// All selectors come from the Site Profile. D41: a control the user can't see isn't offered.

import { isVisible } from '../shared/page-read.js';

/** @param {any} el */
const canSee = (el) => el.type !== 'hidden' && isVisible(el);

/**
 * A "please select" entry isn't a value. Placeholders differ per filter: blank, 0, a space or text (insight 19).
 * @param {{ value: string, text: string }} option
 * @param {any} filter
 */
export function isPlaceholder(option, filter) {
  const value = option.value.trim();
  const text = option.text.replace(/\s+/g, ' ').trim();
  if (value === '') return true;
  if (filter.empty !== undefined && value === filter.empty.trim()) return true;
  return /^(-+|please\b|select\b)/i.test(text);
}

/** @param {any} select @param {any} filter */
function optionsOf(select, filter) {
  return [...select.options]
    .map((o) => ({ value: o.value, text: o.text.replace(/\s+/g, ' ').trim() }))
    .filter((o) => !isPlaceholder(o, filter));
}

/**
 * Reads one filter from the page.
 * @param {any} doc
 * @param {any} filter
 * @returns {any}
 */
function scanFilter(doc, filter) {
  const base = { id: filter.id };
  if (filter.parts) {
    const parts = filter.parts.map((/** @type {any} */ part) => {
      const el = doc.querySelector(part.selector);
      if (!el) return { role: part.role, missing: true };
      return {
        role: part.role,
        value: el.value,
        ...(el.tagName === 'SELECT' ? { options: [...el.options].map((/** @type {any} */ o) => ({ value: o.value, text: o.text.trim() })) } : {}),
      };
    });
    if (parts.some((/** @type {any} */ p) => p.missing)) return { ...base, vanished: true };
    return { ...base, parts };
  }
  const el = doc.querySelector(filter.selector);
  if (!el) return { ...base, vanished: true };
  if (filter.control === 'tree') {
    const valueEl = filter.valueSelector ? doc.querySelector(filter.valueSelector) : el;
    return { ...base, value: valueEl?.value ?? '', name: el.value, locked: !canSee(el) };
  }
  if (filter.control === 'tabs') return { ...base, value: el.value };
  if (el.tagName === 'SELECT') return { ...base, value: el.value, options: optionsOf(el, filter) };
  return { ...base, value: el.value };
}

/**
 * Reads every panel filter from the page.
 * @param {any} doc
 * @param {any} flow
 */
export function scanFilters(doc, flow) {
  return flow.filters.filter((/** @type {any} */ f) => f.panel).map((/** @type {any} */ f) => scanFilter(doc, f));
}

/** @param {any} el */
function fire(el) {
  const view = el.ownerDocument.defaultView;
  el.dispatchEvent(new view.Event('input', { bubbles: true }));
  el.dispatchEvent(new view.Event('change', { bubbles: true }));
}

/** @param {any} el @param {string} value */
function setPlain(el, value) {
  el.value = value;
  fire(el);
}

/** Chooses an option, or the page's own "no selection" entry when the panel says All. @param {any} select @param {string} value @param {any} filter */
function setSelect(select, value, filter) {
  const options = [...select.options];
  const wanted = value.trim() === (filter.empty ?? '').trim() || value.trim() === ''
    ? options.find((o) => isPlaceholder({ value: o.value, text: o.text }, filter))
    : options.find((o) => o.value === value);
  if (wanted) select.value = wanted.value;
  fire(select);
}

/** Options as text, so a change can be seen. @param {any} select */
const optionSignature = (select) => [...select.options].map((/** @type {any} */ o) => o.value).join('|');

/**
 * M3-T02: waits for a page's own script to refill a child list. A child that doesn't change is fine; the time limit keeps it short.
 * @param {any} select
 * @param {string} before
 * @param {number} budgetMs
 * @returns {Promise<boolean>} whether the list changed
 */
async function waitForChange(select, before, budgetMs) {
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    if (optionSignature(select) !== before) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

/**
 * @param {any} doc
 * @param {any} select
 * @param {any} source
 * @param {string} parentValue
 * @param {(url: string, init: any) => Promise<string>} request
 */
async function refillFromSource(doc, select, source, parentValue, request) {
  const body = new URLSearchParams({ ...source.fixed, [source.params[0]]: parentValue }).toString();
  const html = await request(source.url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const holder = doc.createElement('select');
  holder.innerHTML = html; // Parsed by a select, so only options survive; nothing runs.
  select.innerHTML = '';
  for (const option of [...holder.options]) select.add(option);
}

/**
 * Applies one value to the real page, then waits for any list that depends on it.
 * @param {{ doc: any, flow: any, profile: any, filterId: string, value: any, request: (url: string, init: any) => Promise<string>, budgetMs?: number }} input
 * @returns {Promise<{ refilled: string[] }>}
 */
export async function applyFilter({ doc, flow, profile, filterId, value, request, budgetMs = 8000 }) {
  const filter = flow.filters.find((/** @type {any} */ f) => f.id === filterId);
  if (!filter) throw new Error(`Unknown filter ${filterId}`);
  const children = flow.filters.filter((/** @type {any} */ f) => f.dependsOn?.includes(filterId));
  const childEls = children.map((/** @type {any} */ c) => ({ filter: c, el: doc.querySelector(c.selector) })).filter((/** @type {any} */ c) => c.el);
  const before = childEls.map((/** @type {any} */ c) => optionSignature(c.el));
  /** @type {string[]} */
  const refilled = [];

  if (filter.parts) {
    for (const part of filter.parts) {
      const el = doc.querySelector(part.selector);
      const v = value?.[part.role];
      if (el && v !== undefined) setPlain(el, v);
    }
    return { refilled };
  }

  const el = doc.querySelector(filter.selector);
  if (!el) throw new Error(`${filter.label} is no longer on this page.`);

  if (filter.control === 'tree') {
    if (value?.names) {
      el.value = value.names.join('; ');
      fire(el);
      return { refilled };
    }
    el.value = value?.name ?? '';
    const valueEl = filter.valueSelector ? doc.querySelector(filter.valueSelector) : null;
    if (valueEl) valueEl.value = value?.id ?? '';
    // Choosing from the portal's own popup refills the child by a page function. The panel has its own picker, so it refills here.
    for (const child of childEls) {
      const source = profile.sharedSources[child.filter.source];
      if (!source?.params?.length) continue;
      if (value?.id) {
        await refillFromSource(doc, child.el, source, value.id, request);
        refilled.push(child.filter.id);
      }
    }
    return { refilled };
  }

  if (el.tagName === 'SELECT') {
    setSelect(el, value, filter);
    // The page's own handler refills these; wait for it.
    for (let i = 0; i < childEls.length; i++) {
      if (await waitForChange(childEls[i].el, before[i], budgetMs)) refilled.push(childEls[i].filter.id);
    }
    return { refilled };
  }
  setPlain(el, value ?? '');
  return { refilled };
}

/**
 * Sets the panel's defaults on the page: Status and Tender Type start at All, though the pages start elsewhere.
 * @param {any} doc
 * @param {any} flow
 */
export function applyDefaults(doc, flow) {
  for (const filter of flow.filters) {
    if (!filter.panel || filter.default === undefined) continue;
    const el = doc.querySelector(filter.selector);
    if (!el) continue;
    if (el.tagName !== 'SELECT') {
      el.value = filter.default;
      continue;
    }
    // A select's own values can differ from what's sent: match by the choice's label.
    const label = filter.choices?.find((/** @type {any} */ c) => c.value === filter.default)?.label ?? filter.default;
    const option = [...el.options].find((o) => o.text.trim() === label);
    if (option && el.value !== option.value) el.value = option.value;
  }
}
