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

/** A refilled list starts on its "no selection" entry, so nothing is filtered without the user choosing it. @param {any} select @param {any} filter */
function selectPlaceholder(select, filter) {
  select.selectedIndex = [...select.options].findIndex((o) => isPlaceholder({ value: o.value, text: o.text }, filter));
}

/**
 * @param {any} doc
 * @param {any} select
 * @param {any} filter
 * @param {any} source
 * @param {string} parentValue
 * @param {(url: string, init: any) => Promise<string>} request
 */
async function refillFromSource(doc, select, filter, source, parentValue, request) {
  const body = new URLSearchParams({ ...source.fixed, [source.params[0]]: parentValue }).toString();
  const html = await request(source.url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  // Read in a detached document, where nothing runs, and copied as plain options: only a value and a text survive.
  const parsed = new doc.defaultView.DOMParser().parseFromString(`<select>${html}</select>`, 'text/html');
  const options = [...parsed.getElementsByTagName('option')].map((o) => {
    const option = doc.createElement('option');
    option.value = o.value;
    option.text = o.text;
    return option;
  });
  // All at once: moving options across one at a time leaves the last one selected (owner found this, 2026-11-07).
  select.replaceChildren(...options);
  selectPlaceholder(select, filter);
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
        await refillFromSource(doc, child.el, child.filter, source, value.id, request);
        refilled.push(child.filter.id);
      } else {
        // The parent was cleared, so the child's list no longer applies.
        for (const o of [...child.el.options]) if (!isPlaceholder({ value: o.value, text: o.text }, child.filter)) o.remove();
        selectPlaceholder(child.el, child.filter);
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

/** The selected entry's words. @param {any} el */
const selectedText = (el) => (el.selectedOptions?.[0]?.text ?? el.options?.[el.selectedIndex]?.text ?? '').replace(/\s+/g, ' ').trim();

/** dd/mm/yyyy as the request wants it (insight 21). @param {string} text @param {string} [format] */
function sendDate(text, format) {
  const value = (text ?? '').trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return m && format === 'yyyy-mm-dd' ? `${m[3]}-${m[2]}-${m[1]}` : value;
}

/**
 * What a search sends, read from the page the user set up, and what to show for it in the file. Frozen when a run starts,
 * so the user can go on using the page. The fields are the ones the portal's own request carries (recon notes).
 * @param {any} doc
 * @param {any} flow
 * @returns {{ fields: Record<string, string>, shown: { label: string, value: string }[], loops: Record<string, any> }}
 */
export function buildRequest(doc, flow) {
  /** @type {Record<string, string>} */
  const fields = {};
  /** @type {{ label: string, value: string }[]} */
  const shown = [];
  /** @type {Record<string, any>} */
  const loops = {};
  const label = (/** @type {any} */ f) => f.label.replace(/^(Select|By) /, '');
  for (const filter of flow.filters) {
    if (filter.parts) {
      const words = [];
      for (const part of filter.parts) {
        const el = doc.querySelector(part.selector);
        const value = el ? el.value : part.empty ?? part.default ?? '';
        fields[part.requestField] = filter.sendFormat ? sendDate(value, filter.sendFormat) : value;
        if (filter.control === 'dateRange') shown.push({ label: `${label(filter)} ${part.role === 'from' ? 'From' : 'To'}`, value: value.trim() || '-' });
        else if (value.trim() && (part.role === 'value' || part.role === 'value2' || part.role === 'text')) words.push(value.trim());
        else if (part.role === 'operator' || part.role === 'mode') words.push(value.trim());
      }
      if (filter.control !== 'dateRange') {
        const hasValue = filter.parts.some((/** @type {any} */ p) => (p.role === 'value' || p.role === 'text') && doc.querySelector(p.selector)?.value?.trim());
        shown.push({ label: label(filter), value: hasValue ? words.filter(Boolean).join(' ') : '-' });
      }
      continue;
    }
    const el = doc.querySelector(filter.selector);
    if (!el) {
      fields[filter.requestField] = filter.empty ?? filter.default ?? '';
      if (filter.panel) shown.push({ label: label(filter), value: '-' });
      continue;
    }
    if (filter.control === 'tree') {
      const valueEl = filter.valueSelector ? doc.querySelector(filter.valueSelector) : el;
      fields[filter.requestField] = valueEl?.value ?? '';
      shown.push({ label: label(filter), value: el.value.trim() || 'All' });
      continue;
    }
    if (el.tagName === 'SELECT') {
      const choice = filter.choices?.find((/** @type {any} */ c) => c.label === selectedText(el) || c.value === el.value);
      const option = { value: el.value, text: selectedText(el) };
      const blank = isPlaceholder(option, filter);
      fields[filter.requestField] = choice?.value ?? (blank ? filter.empty ?? '' : el.value);
      if (filter.mirrorField) fields[filter.mirrorField] = blank ? '' : option.text;
      if (filter.allMeansLoop || filter.multiPick) loops[filter.id] = { field: filter.requestField, mirror: filter.mirrorField, options: optionsOf(el, filter), selected: blank ? null : option };
      if (filter.panel) shown.push({ label: label(filter), value: choice?.label ?? (blank ? 'All' : option.text) });
      continue;
    }
    fields[filter.requestField] = filter.sendFormat ? sendDate(el.value, filter.sendFormat) : el.value;
    const named = filter.choices?.find((/** @type {any} */ c) => c.value === el.value)?.label;
    if (filter.panel) shown.push({ label: label(filter), value: named ?? (el.value.trim() || '-') });
  }
  for (const name of flow.report?.request.fromPage ?? []) fields[name] = doc.getElementsByName(name)[0]?.value ?? '';
  return { fields, shown, loops };
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
