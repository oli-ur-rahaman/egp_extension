// @ts-nocheck: draws from the page's scanned options. Behaviour is covered by the panel's e2e tests.
// A list you can type into, for long lists such as 224 Procuring Entities.

import { h, icon } from './icons.js';

/** Enough to scroll; beyond this, typing narrows the list. Flow 1 has over 11,000 offices. */
const MAX_SHOWN = 200;

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
    list.children[index]?.scrollIntoView({ block: 'nearest' });
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
    [...list.children].find((li) => li.getAttribute('aria-selected') === 'true')?.scrollIntoView({ block: 'center' });
  }

  function close() {
    list.hidden = true;
    wrap.classList.remove('open');
    box.setAttribute('aria-expanded', 'false');
    box.value = current?.text ?? '';
  }

  /** @param {{ value: string, text: string }} option */
  function pick(option) {
    box.value = option.text;
    list.hidden = true;
    if (option.value !== value) onChange(option.value);
    else close();
  }

  box.addEventListener('focus', open);
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
