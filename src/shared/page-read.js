// Reads what a user can see on a page. Holds no portal knowledge: every selector comes from the Site Profile.
// D41: what a user can't see doesn't exist for this tool.

import { classifyLabel, normaliseLabel } from './profile.js';

/**
 * True when neither the element nor any ancestor is hidden by an inline style or the hidden attribute.
 * @param {Element} el
 */
export function isVisible(el) {
  for (let e = /** @type {Element | null} */ (el); e; e = e.parentElement) {
    const style = e.getAttribute('style') ?? '';
    if (/display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style) || e.hasAttribute('hidden')) return false;
  }
  return true;
}

/** @param {Element} el */
const textOf = (el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * The visible labels on a detail page, sorted into known fields, stated exclusions and labels never seen before.
 * An unknown label is reported, never fatal (BUILD_PLAN).
 * @param {ParentNode} doc
 * @param {any} flow
 * @returns {{ known: string[], ignored: string[], unknown: string[] }}
 */
export function readDetailLabels(doc, flow) {
  /** @type {{ known: string[], ignored: string[], unknown: string[] }} */
  const out = { known: [], ignored: [], unknown: [] };
  const seen = new Set();
  const cells = [...doc.querySelectorAll(flow.detail.labelCell), ...doc.querySelectorAll('th')];
  for (const cell of cells) {
    if (!isVisible(cell)) continue;
    const label = normaliseLabel(textOf(cell));
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const got = classifyLabel(flow, label);
    if (!got) out.unknown.push(label);
    else if ('field' in got) out.known.push(label);
    else out.ignored.push(label);
  }
  return out;
}
