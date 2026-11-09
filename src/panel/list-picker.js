// @ts-nocheck: draws from the page's scanned options. Behaviour is covered by the panel's e2e tests.
// D68: one or many from a long list, such as 11,626 projects or 18 financial years. Search narrows it; what's chosen stays on top.

import { h, icon } from './icons.js';

/** Enough to scroll; beyond this, typing narrows the list. */
const MAX_SHOWN = 300;

/**
 * @param {{ title: string, noneText: string, options: { value: string, text: string }[], chosen: string[], onPick: (ids: string[]) => void, onClose: () => void }} input
 */
export function buildListPicker({ title, noneText, options, chosen, onPick, onClose }) {
  const picked = new Set(chosen);
  const byValue = new Map(options.map((o) => [o.value, o]));
  const list = h('ul', { class: 'pick-list', role: 'listbox', 'aria-multiselectable': 'true' });
  const done = h('button', { id: 'list-done', type: 'button', class: 'btn filled' });
  const search = h('input', { id: 'list-search', type: 'text', placeholder: `Find ${title.toLowerCase()}`, 'aria-label': `Find ${title}`, autocomplete: 'off', oninput: draw });

  const item = (o) => h('li', { role: 'option', 'aria-selected': String(picked.has(o.value)) },
    h('label', { class: 'node' }, h('input', { type: 'checkbox', 'data-value': o.value, checked: picked.has(o.value), onchange: (e) => {
      if (e.target.checked) picked.add(o.value);
      else picked.delete(o.value);
      count();
    } }), h('span', {}, o.text)));

  function count() {
    done.textContent = picked.size ? `Done (${picked.size})` : `Done: ${noneText}`;
  }

  function draw() {
    const words = search.value.trim().toLowerCase();
    const chosenFirst = [...picked].map((v) => byValue.get(v)).filter(Boolean);
    const rest = options.filter((o) => !picked.has(o.value) && (!words || o.text.toLowerCase().includes(words)));
    const shown = rest.slice(0, MAX_SHOWN);
    list.replaceChildren(
      ...(chosenFirst.length ? [h('li', { class: 'pick-head' }, `Chosen (${chosenFirst.length})`), ...chosenFirst.map(item), h('li', { class: 'pick-head' }, words ? 'Matches' : 'All')] : []),
      ...shown.map(item),
      ...(rest.length === 0 ? [h('li', { class: 'tree-note' }, 'No match.')] : []),
      ...(rest.length > MAX_SHOWN ? [h('li', { class: 'tree-note' }, `${(rest.length - MAX_SHOWN).toLocaleString('en-US')} more: type to narrow.`)] : []));
  }

  done.addEventListener('click', () => onPick([...picked]));
  count();
  draw();
  const sheet = h('div', { class: 'sheet', style: 'display:contents', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onkeydown: (e) => {
    if (e.key === 'Escape') onClose();
  } },
    h('header', { class: 'sheet-head' }, h('h2', {}, title), h('button', { id: 'list-close', type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: onClose }, icon('close'))),
    h('div', { class: 'sheet-search' }, icon('search'), search),
    h('div', { class: 'sheet-body' }, list),
    h('footer', { class: 'sheet-foot' },
      h('button', { type: 'button', class: 'btn text', onclick: () => {
        picked.clear();
        count();
        draw();
      } }, 'Clear'),
      h('button', { type: 'button', class: 'btn text', onclick: onClose }, 'Cancel'),
      done));
  sheet.restore = () => search.focus({ preventScroll: true });
  return sheet;
}
