// @ts-nocheck: draws from the page's scanned options. Behaviour is covered by the panel's e2e tests.
// A list you can type into, for long lists such as 224 Procuring Entities.
// It floats over the filters and scrolls only itself, so nothing else moves when it opens, closes or is used.

import { h, icon } from './icons.js';

/** Enough to scroll; beyond this, typing narrows the list. Flow 1 has over 11,000 offices. */
const MAX_SHOWN = 200;
const MAX_HEIGHT = 240;
/** Below this much room under the box, the list opens above it if there's more room there. */
const MIN_ROOM = 160;
const GAP = 4;

/**
 * @param {{ id: string, value: string, options: { value: string, text: string }[], onChange: (value: string) => void }} input
 */
export function combo({ id, value, options, onChange }) {
  const current = options.find((o) => o.value === value) ?? options[0];
  const listId = `${id}-list`;
  const list = h('ul', { id: listId, class: 'combo-list', role: 'listbox', hidden: true });
  const box = h('input', {
    id, type: 'text', value: current?.text ?? '', role: 'combobox', autocomplete: 'off', spellcheck: 'false',
    'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': listId,
  });
  const wrap = h('div', { class: 'combo' }, box, icon('chevronDown'), list);
  /** @type {{ value: string, text: string }[]} */
  let shown = [];
  let active = -1;

  /** @param {number} index */
  function highlight(index) {
    active = index;
    [...list.children].forEach((li, i) => li.classList.toggle('active', i === index));
    const li = /** @type {HTMLElement | undefined} */ (list.children[index]);
    if (!li) return;
    if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
    else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
  }

  /** Beside the box, on the side with room. */
  function place() {
    if (!box.isConnected) return close();
    const r = box.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - GAP * 2;
    const above = r.top - GAP * 2;
    const up = below < MIN_ROOM && above > below;
    list.style.left = `${r.left}px`;
    list.style.width = `${r.width}px`;
    list.style.maxHeight = `${Math.min(MAX_HEIGHT, up ? above : below)}px`;
    list.style.top = up ? 'auto' : `${r.bottom + GAP}px`;
    list.style.bottom = up ? `${window.innerHeight - r.top + GAP}px` : 'auto';
  }

  /** @param {string} text */
  function draw(text) {
    const words = text.trim().toLowerCase();
    const matches = words ? options.filter((o) => o.text.toLowerCase().includes(words)) : options;
    shown = matches.slice(0, MAX_SHOWN);
    list.replaceChildren(
      ...shown.map((o) => h('li', { role: 'option', 'aria-selected': o.value === value ? 'true' : 'false', onclick: () => pick(o) }, o.text)),
      ...(matches.length === 0 ? [h('li', { class: 'none' }, 'No match')] : []),
      ...(matches.length > MAX_SHOWN ? [h('li', { class: 'none' }, `Type to narrow ${(matches.length - MAX_SHOWN).toLocaleString('en-US')} more`)] : []),
    );
    active = -1;
  }

  function open() {
    if (!list.hidden) return;
    draw('');
    list.hidden = false;
    wrap.classList.add('open');
    box.setAttribute('aria-expanded', 'true');
    box.select();
    place();
    document.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    const selected = [...list.children].find((li) => li.getAttribute('aria-selected') === 'true');
    if (selected) list.scrollTop = selected.offsetTop - (list.clientHeight - selected.offsetHeight) / 2;
  }

  function hide() {
    list.hidden = true;
    wrap.classList.remove('open');
    box.setAttribute('aria-expanded', 'false');
    document.removeEventListener('scroll', place, true);
    window.removeEventListener('resize', place);
  }

  function close() {
    hide();
    box.value = current?.text ?? '';
  }

  /** @param {{ value: string, text: string }} option */
  function pick(option) {
    box.value = option.text;
    hide();
    if (option.value !== value) onChange(option.value);
    else close();
  }

  // On a click or typing, not on focus: the panel gives focus back after each redraw, and that mustn't reopen a list.
  box.addEventListener('click', open);
  box.addEventListener('input', () => {
    if (list.hidden) open();
    draw(box.value);
    if (shown.length) highlight(0);
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) open();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      highlight(Math.max(0, Math.min(shown.length - 1, active + step)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (shown[active]) pick(shown[active]);
    } else if (e.key === 'Escape' && !list.hidden) {
      e.stopPropagation();
      close();
    }
  });
  // Clicking the list must not take focus from the box, or it closes before the click lands.
  list.addEventListener('mousedown', (e) => e.preventDefault());
  box.addEventListener('blur', close);
  return wrap;
}
