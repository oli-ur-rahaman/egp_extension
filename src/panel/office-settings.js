// @ts-nocheck: draws from the office tree. Behaviour is covered by the panel's e2e tests.
// D66: the Office hierarchy screen. The user places an office the tree doesn't know, or moves one, and can undo all of it.
// Kept in this browser; Export and Import carry it to the other PC.

import { flatNodes, OVERRIDES_KEY } from '../shared/offices.js';
import { combo } from './combo.js';
import { h, icon } from './icons.js';

const NOWHERE = '__nowhere__';

/**
 * @param {{ tree: any, overrides: Record<string, string | null>, seen: Record<string, string>, onClose: () => void, onSaved: () => void }} input
 */
export function buildOfficeSettings({ tree, overrides, seen, onClose, onSaved }) {
  const nodes = flatNodes(tree);
  const byId = new Map(nodes.map((n) => [n.node.id, n]));
  const shippedPlace = new Map(nodes.filter((n) => n.node.egpId).map((n) => [n.node.egpId, n.node.id]));
  const offices = { ...tree.egpOffices, ...seen };
  const changes = { ...overrides };
  const placeOf = (id) => (id in changes ? changes[id] : shippedPlace.get(id) ?? null);
  const pathText = (nodeId) => {
    const n = byId.get(nodeId);
    return n ? [...n.path, n.node.name].join(' › ') : 'Not in the hierarchy';
  };
  // "Under X" for the user's own placements; the office itself for a shipped match.
  const placeText = (id) => {
    const nodeId = placeOf(id);
    if (!nodeId) return 'Not in the hierarchy';
    return id in changes ? `Under ${pathText(nodeId)}` : pathText(nodeId);
  };
  const choices = [{ value: NOWHERE, text: 'Not in the hierarchy' }, ...nodes.map((n) => ({ value: n.node.id, text: [...n.path, n.node.name].join(' › ') }))];

  const list = h('ul', { class: 'settings-list' });
  const search = h('input', { id: 'settings-search', type: 'text', placeholder: 'Find an office', 'aria-label': 'Find an office', autocomplete: 'off', oninput: draw });

  async function save() {
    await chrome.storage.local.set({ [OVERRIDES_KEY]: changes });
    onSaved();
    draw();
  }

  function row(id) {
    const name = offices[id];
    const where = h('small', {}, placeText(id), id in changes && h('span', { class: 'tag' }, 'changed'));
    const line = h('li', { 'data-office': id }, h('div', { class: 'settings-row' }, h('span', { class: 'settings-name' }, name, where),
      h('button', { type: 'button', class: 'btn text', 'data-move': id, onclick: () => {
        const box = combo({ id: `move-${id}`, value: placeOf(id) ?? NOWHERE, options: choices, onChange: (value) => {
          // Back where the shipped tree has it: no change to keep.
          if ((value === NOWHERE ? null : value) === (shippedPlace.get(id) ?? null)) delete changes[id];
          else changes[id] = value === NOWHERE ? null : value;
          save();
        } });
        line.append(h('div', { class: 'settings-move' }, h('p', { class: 'hint' }, `Place it under, or "Not in the hierarchy":`), box));
        box.querySelector('input').click();
      } }, 'Move')));
    return line;
  }

  function draw() {
    const words = search.value.trim().toLowerCase();
    const ids = Object.keys(offices).filter((id) => !words || offices[id].toLowerCase().includes(words));
    const loose = ids.filter((id) => !placeOf(id));
    const placed = ids.filter((id) => placeOf(id));
    list.replaceChildren(
      h('li', { class: 'settings-head' }, `Not in the hierarchy (${loose.length})`), ...loose.map(row),
      h('li', { class: 'settings-head' }, `Placed (${placed.length})`), ...placed.map(row));
  }

  const exportFile = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ officeOverrides: changes }, null, 1)], { type: 'application/json' }));
    chrome.downloads.download({ url, filename: 'pdms-office-hierarchy.json' }).finally(() => setTimeout(() => URL.revokeObjectURL(url), 60000));
  };
  const picker = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const got = JSON.parse(await file.text()).officeOverrides;
      if (!got || typeof got !== 'object') throw new Error('not a hierarchy file');
      for (const k of Object.keys(changes)) delete changes[k];
      Object.assign(changes, got);
      await save();
    } catch (err) {
      alert(`That file couldn't be read: ${err.message}`);
    }
  } });

  draw();
  return h('div', { class: 'sheet', style: 'display:contents', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Office hierarchy' },
    h('header', { class: 'sheet-head' }, h('h2', {}, 'Office hierarchy'), h('button', { id: 'settings-close', type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: onClose }, icon('close'))),
    h('p', { class: 'settings-intro' }, 'PWD offices as the office picker groups them. When e-GP lists a new office, or one sits in the wrong place, press Move and choose where it belongs. Changes are kept in this browser; Export them to use on another PC.'),
    h('div', { class: 'sheet-search' }, icon('search'), search),
    h('div', { class: 'sheet-body' }, list),
    h('footer', { class: 'sheet-foot' },
      h('button', { type: 'button', class: 'btn text', onclick: () => picker.click() }, 'Import'),
      h('button', { type: 'button', class: 'btn text', onclick: exportFile }, 'Export'),
      h('button', { id: 'settings-reset', type: 'button', class: 'btn text', onclick: () => {
        if (!confirm('Undo every change you made to the office hierarchy?')) return;
        for (const k of Object.keys(changes)) delete changes[k];
        save();
      } }, 'Undo all changes'),
      picker));
}
