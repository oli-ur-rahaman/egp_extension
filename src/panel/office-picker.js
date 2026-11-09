// @ts-nocheck: draws from the office tree. Behaviour is covered by the panel's e2e tests.
// D66: the office picker. Clusters as the owner's hierarchy has them, offices that fit nowhere first,
// buttons for every zone, circle or division office, and one or many offices chosen.

import { officesUnder, placeOffices } from '../shared/offices.js';
import { h, icon } from './icons.js';

const LEVELS = [[2, 'Zones'], [3, 'Circles'], [4, 'Divisions']];

/**
 * @param {{ title: string, tree: any, overrides: Record<string, string | null>, options: { value: string, text: string }[], chosen: string[], onPick: (ids: string[]) => void, onClose: () => void }} input
 */
export function buildOfficePicker({ title, tree, overrides, options, chosen, onPick, onClose }) {
  const { roots, unplaced, levels } = placeOffices(tree, overrides, options);
  const picked = new Set(chosen.filter((id) => options.some((o) => o.value === id)));
  /** Checkboxes to refresh after any change: [element, office IDs it stands for]. */
  const boxes = [];
  const done = h('button', { id: 'offices-done', type: 'button', class: 'btn filled' });
  const levelButtons = LEVELS.filter(([level]) => levels[level].length).map(([level, word]) => {
    const button = h('button', { type: 'button', class: 'chip-btn', 'data-level': String(level), onclick: () => {
      const ids = levels[level];
      const all = ids.every((id) => picked.has(id));
      for (const id of ids) {
        if (all) picked.delete(id);
        else picked.add(id);
      }
      refresh();
    } }, `${word} (${levels[level].length})`);
    return { button, level };
  });

  function refresh() {
    for (const [box, ids] of boxes) {
      const on = ids.filter((id) => picked.has(id)).length;
      box.checked = on > 0 && on === ids.length;
      box.indeterminate = on > 0 && on < ids.length;
    }
    for (const { button, level } of levelButtons) button.setAttribute('aria-pressed', String(levels[level].every((id) => picked.has(id))));
    done.textContent = picked.size === 0 ? 'Done: All offices' : `Done (${picked.size})`;
  }

  const toggle = (ids, on) => {
    for (const id of ids) {
      if (on) picked.add(id);
      else picked.delete(id);
    }
    refresh();
  };

  const officeRow = (office, depth, own) => {
    const box = h('input', { type: 'checkbox', 'data-office': office.value, onchange: (e) => toggle([office.value], e.target.checked) });
    boxes.push([box, [office.value]]);
    return h('li', { role: 'treeitem', 'data-name': office.text.toLowerCase() },
      h('div', { class: 'tree-row', style: `--depth:${depth}` }, h('span', { class: 'twist-gap' }),
        h('label', { class: 'node' }, box, h('span', {}, office.text, own && h('small', { class: 'own' }, ' (this office)')))));
  };

  /** A cluster: its box chooses everything under it. */
  const clusterRow = (name, ids, depth, children, startOpen, key) => {
    const box = h('input', { type: 'checkbox', 'data-cluster': key, onchange: (e) => toggle(ids, e.target.checked) });
    boxes.push([box, ids]);
    const list = h('ul', { class: 'tree', role: 'group', hidden: !startOpen }, ...children);
    const twist = h('button', { type: 'button', class: 'twist', 'aria-label': `Open ${name}`, 'aria-expanded': String(startOpen), onclick: () => {
      list.hidden = !list.hidden;
      twist.setAttribute('aria-expanded', String(!list.hidden));
    } }, icon('chevronRight'));
    return h('li', { role: 'treeitem', 'data-name': name.toLowerCase() },
      h('div', { class: 'tree-row', style: `--depth:${depth}` }, twist,
        h('label', { class: 'node' }, box, h('span', {}, name, h('small', { class: 'count' }, ` ${ids.length}`)))),
      list);
  };

  const nodeRow = (node, depth) => {
    if (!node.children.length) return officeRow(node.office, depth, false);
    const inside = [
      ...(node.office ? [officeRow(node.office, depth + 1, true)] : []),
      ...node.children.map((c) => nodeRow(c, depth + 1)),
    ];
    return clusterRow(node.name, officesUnder(node), depth, inside, depth === 0, node.id);
  };

  const body = h('ul', { class: 'tree', role: 'tree' },
    ...(unplaced.length ? [clusterRow('Not in the hierarchy', unplaced.map((o) => o.value), 0, unplaced.map((o) => officeRow(o, 1, false)), false, 'unplaced')] : []),
    ...roots.map((r) => nodeRow(r, 0)));

  const search = h('input', { id: 'offices-search', type: 'text', placeholder: 'Find an office', 'aria-label': 'Find an office', autocomplete: 'off', oninput: () => {
    const words = search.value.trim().toLowerCase();
    for (const li of body.getElementsByTagName('li')) {
      const match = !words || li.dataset.name.includes(words) || [...li.getElementsByTagName('li')].some((c) => c.dataset.name.includes(words));
      li.hidden = !match;
      // Open the clusters that hold a match, so it can be seen.
      const group = li.querySelector(':scope > ul');
      if (group && words && match) group.hidden = false;
    }
  } });

  done.addEventListener('click', () => onPick([...picked]));
  refresh();
  const sheet = h('div', { class: 'sheet', style: 'display:contents', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onkeydown: (e) => {
    if (e.key === 'Escape') onClose();
  } },
    h('header', { class: 'sheet-head' }, h('h2', {}, title), h('button', { id: 'offices-close', type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: onClose }, icon('close'))),
    h('div', { class: 'level-bar' }, h('span', { class: 'hint' }, 'Choose every office of a kind:'), ...levelButtons.map((b) => b.button)),
    h('div', { class: 'sheet-search' }, icon('search'), search),
    h('div', { class: 'sheet-body' }, body),
    h('footer', { class: 'sheet-foot' },
      h('button', { type: 'button', class: 'btn text', onclick: () => toggle([...picked], false) }, 'Clear'),
      h('button', { type: 'button', class: 'btn text', onclick: onClose }, 'Cancel'),
      done));
  sheet.restore = () => search.focus({ preventScroll: true });
  return sheet;
}
