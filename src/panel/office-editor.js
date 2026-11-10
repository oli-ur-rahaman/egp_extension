// @ts-nocheck: draws from the office tree. Behaviour is covered by the panel's e2e tests.
// D67: the Office hierarchy editor. Drag an office onto another to put it under it, or above or below it;
// Alt and the arrow keys do the same from the keyboard. New e-GP offices wait in Not set; offices e-GP no longer lists are hidden.
// The hierarchy goes out to Excel and comes back from it, in the owner's own layout.

import { buildXls } from '../shared/xls-writer.js';
import * as XLSX from '../../vendor/xlsx.js';
import { copyTree, findNode, fromRows, HEADERS, LEVEL_NAMES, moveNode, nudge, placeOffice, reconcile, SHEET_EGP, SHEET_OFFICES, toRows, unsetOffice } from '../shared/office-tree-edit.js';
import { h, icon } from './icons.js';
import { saveFile } from './save-file.js';

const GRIP = 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01';

function grip() {
  const svg = icon('close');
  svg.querySelector('path').setAttribute('d', GRIP);
  svg.classList.add('grip');
  return svg;
}

/**
 * @param {{ tree: any, shipped: any, live: { value: string, text: string }[], liveFrom: string, onSave: (tree: any) => Promise<void>, onClose: () => void }} input
 */
export function buildOfficeEditor({ tree: start, shipped, live, liveFrom, onSave, onClose }) {
  let tree = copyTree(start);
  const history = [];
  // The top two levels start unfolded: Chief Engineer and the zones.
  const open = new Set();
  const openTop = () => tree.nodes.forEach((n) => { open.add(n.id); n.children.forEach((c) => open.add(c.id)); });
  openTop();
  let showGone = false;
  let unsetOpen = true;
  let dragging = null; // { kind: 'node', id } or { kind: 'office', office }

  const message = h('p', { id: 'editor-message', class: 'editor-message', role: 'status', 'aria-live': 'polite' });
  const say = (text, bad = false) => {
    message.textContent = text;
    message.classList.toggle('bad', bad);
  };
  const body = h('div', { class: 'sheet-body', id: 'editor-body' });
  const search = h('input', { id: 'editor-search', type: 'text', placeholder: 'Find an office', 'aria-label': 'Find an office', autocomplete: 'off', oninput: () => draw() });
  const goneToggle = h('label', { class: 'tick', id: 'editor-gone' }, h('input', { type: 'checkbox', onchange: (e) => {
    showGone = e.target.checked;
    draw();
  } }), h('span', {}));
  const undoBtn = h('button', { id: 'editor-undo', type: 'button', class: 'btn text', onclick: undo }, 'Undo');

  async function commit(result, done) {
    if (result.error) return say(result.error, true);
    history.push(tree);
    tree = result.tree;
    await onSave(tree);
    say(done);
    draw();
  }

  async function undo() {
    if (!history.length) return;
    tree = history.pop();
    await onSave(tree);
    say('Undone.');
    draw();
  }

  /** Where in a row the pointer is: the top quarter puts it above, the bottom quarter below, the middle inside. */
  function zone(row, event) {
    const box = row.getBoundingClientRect();
    const y = event.clientY - box.top;
    if (y < box.height * 0.25) return 'before';
    if (y > box.height * 0.75) return 'after';
    return 'inside';
  }

  function clearMarks() {
    for (const el of [...body.getElementsByClassName('editor-row'), ...body.getElementsByClassName('editor-unset')]) el.classList.remove('drop-before', 'drop-after', 'drop-inside', 'drop-unset');
  }

  const nameOf = (id) => findNode(tree.nodes, id)?.node.name ?? '';

  async function dropOn(targetId, where) {
    const verb = where === 'inside' ? 'under' : where === 'before' ? 'above' : 'below';
    if (dragging?.kind === 'node') await commit(moveNode(tree, dragging.id, targetId, where), `Moved ${nameOf(dragging.id)} ${verb} ${nameOf(targetId)}.`);
    else if (dragging?.kind === 'office') {
      if (where === 'inside') open.add(targetId);
      await commit(placeOffice(tree, dragging.office, targetId, where), `Placed ${dragging.office.text} ${verb} ${nameOf(targetId)}.`);
    }
    dragging = null;
  }

  function nodeRow(node, depth, gone) {
    const hasKids = node.children.some((c) => showGone || !gone.has(c.id));
    const isOpen = open.has(node.id) || !!search.value.trim();
    const row = h('div', {
      class: `editor-row${gone.has(node.id) ? ' gone' : ''}${node.egpId ? '' : ' heading'}`,
      style: `--depth:${depth - 1}`, draggable: 'true', tabindex: '0', 'data-node': node.id, role: 'treeitem', 'aria-level': String(depth),
      'aria-expanded': hasKids ? String(isOpen) : undefined,
      title: 'Drag onto an office to put it under it; near its top or bottom edge to put it above or below.',
    },
      grip(),
      hasKids ? h('button', { type: 'button', class: 'twist', tabindex: '-1', 'aria-label': `${isOpen ? 'Close' : 'Open'} ${node.name}`, 'aria-expanded': String(isOpen), onclick: (e) => {
        e.stopPropagation();
        if (open.has(node.id)) open.delete(node.id);
        else open.add(node.id);
        draw();
      } }, icon('chevronRight')) : h('span', { class: 'twist-gap' }),
      h('span', { class: 'editor-name' }, node.name,
        gone.has(node.id) && h('small', {}, 'No longer on e-GP'),
        !node.egpId && h('small', {}, 'Heading only: not an office on e-GP')),
      h('span', { class: 'level-chip' }, LEVEL_NAMES[depth]));
    row.addEventListener('dragstart', (e) => {
      dragging = { kind: 'node', id: node.id };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', node.id);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      clearMarks();
    });
    row.addEventListener('dragover', (e) => {
      if (!dragging || (dragging.kind === 'node' && dragging.id === node.id)) return;
      e.preventDefault();
      clearMarks();
      row.classList.add(`drop-${zone(row, e)}`);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after', 'drop-inside'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const where = zone(row, e);
      clearMarks();
      dropOn(node.id, where);
    });
    row.addEventListener('keydown', (e) => {
      const key = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
      if (e.altKey && key) {
        e.preventDefault();
        commit(nudge(tree, node.id, key), `Moved ${node.name}.`).then(() => [...body.getElementsByClassName('editor-row')].find((r) => r.dataset.node === node.id)?.focus());
      } else if (e.key === 'Delete' && node.egpId) {
        e.preventDefault();
        commit(unsetOffice(tree, node.id), `${node.name} is now Not set.`);
      }
    });
    const kids = hasKids && isOpen ? node.children.filter((c) => showGone || !gone.has(c.id)).map((c) => nodeRow(c, depth + 1, gone)) : [];
    return h('div', { class: 'editor-branch', 'data-name': node.name.toLowerCase() }, row, ...kids);
  }

  /** Keeps what matches the search, and what leads to it. */
  function matches(node, words) {
    return node.name.toLowerCase().includes(words) || node.children.some((c) => matches(c, words));
  }

  function draw() {
    const { scrollTop } = body;
    const words = search.value.trim().toLowerCase();
    const { unset, gone } = reconcile(tree, live);
    goneToggle.hidden = gone.size === 0;
    goneToggle.lastChild.textContent = `Show ${gone.size} ${gone.size === 1 ? 'office' : 'offices'} no longer on e-GP`;
    undoBtn.disabled = history.length === 0;

    const unsetList = unset.filter((o) => !words || o.text.toLowerCase().includes(words)).map((o) => {
      const row = h('div', { class: 'editor-row loose', draggable: 'true', tabindex: '0', 'data-office': o.value, title: 'Drag onto an office to place it.' },
        grip(), h('span', { class: 'twist-gap' }), h('span', { class: 'editor-name' }, o.text), h('span', { class: 'level-chip' }, 'Not set'));
      row.addEventListener('dragstart', (e) => {
        dragging = { kind: 'office', office: o };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', o.value);
      });
      row.addEventListener('dragend', clearMarks);
      return row;
    });
    const unsetBox = h('section', { id: 'editor-unset', class: unsetOpen ? 'editor-unset' : 'editor-unset shut' },
      h('h3', {}, h('button', { type: 'button', class: 'twist', 'aria-expanded': String(unsetOpen), 'aria-label': unsetOpen ? 'Fold Not set' : 'Open Not set', onclick: () => {
        unsetOpen = !unsetOpen;
        draw();
      } }, icon('chevronRight')), `Not set (${unset.length})`, h('small', {}, unset.length ? ' new or unmatched; drag each to its place' : ' drag an office here to take it out')),
      ...(unsetOpen ? unsetList : []));
    // Dropping a placed office here takes it out of the hierarchy.
    unsetBox.addEventListener('dragover', (e) => {
      if (dragging?.kind !== 'node') return;
      e.preventDefault();
      clearMarks();
      unsetBox.classList.add('drop-unset');
    });
    unsetBox.addEventListener('dragleave', () => unsetBox.classList.remove('drop-unset'));
    unsetBox.addEventListener('drop', (e) => {
      e.preventDefault();
      clearMarks();
      if (dragging?.kind === 'node') commit(unsetOffice(tree, dragging.id), `${nameOf(dragging.id)} is now Not set.`);
      dragging = null;
    });

    const roots = tree.nodes.filter((n) => (showGone || !gone.has(n.id)) && (!words || matches(n, words)));
    const prune = (n) => ({ ...n, children: n.children.filter((c) => !words || matches(c, words)).map(prune) });
    body.replaceChildren(unsetBox, h('div', { class: 'editor-tree', role: 'tree', 'aria-label': 'Office hierarchy' }, ...roots.map((n) => nodeRow(words ? prune(n) : n, 1, gone))));
    body.scrollTop = scrollTop;
  }

  // --- Excel out and in

  async function downloadExcel() {
    const head = { bold: true, color: 'FFFFFF', fill: '1F3864', border: true, wrap: true, v: 'center' };
    const cell = (v) => ({ v, s: { border: true, v: 'top' } });
    const rows = toRows(tree, live);
    const placed = new Set(rows.filter((r) => r[0] !== 'Not set' && r[2]).map((r) => r[2]));
    const sheets = [
      { name: 'How to fill', widths: [100], hideGrid: true, rows: [
        [{ v: 'PWD office hierarchy, for the Procurement Data Management System (PDMS)', s: { bold: true, size: 14 } }],
        [{ v: `Downloaded ${new Date().toLocaleString('en-GB')}. e-GP offices as seen ${liveFrom}.` }],
        [],
        ...[
          'The Office Hierarchy sheet holds one office per row, in order: each office sits under the nearest row above it with a higher level.',
          `Level is one of: ${Object.values(LEVEL_NAMES).join(', ')}.`,
          'To add an office: insert a row below the office it belongs under, give its Level and Office name, and, if it is on e-GP, its e-GP office ID.',
          'e-GP office IDs are on the e-GP offices sheet. An office with no ID is a heading only, used to group offices.',
          'Rows marked Not set are e-GP offices with no place yet. Give each a Level and move it under its office, or leave it Not set.',
          'Keep the column names. Then use Import Excel in the extension. The import replaces the hierarchy; Undo puts the old one back.',
        ].map((t) => [{ v: t, s: { wrap: true } }]),
      ] },
      { name: SHEET_OFFICES, widths: [16, 60, 14, 50, 12], freeze: true, rows: [HEADERS.map((x) => ({ v: x, s: head })), ...rows.map((r) => r.map(cell))] },
      { name: SHEET_EGP, widths: [14, 60, 12], freeze: true, rows: [['e-GP office ID', 'Name on e-GP', 'Placed'].map((x) => ({ v: x, s: head })), ...live.map((o) => [cell(o.value), cell(o.text), cell(placed.has(o.value) ? 'Yes' : 'Not set')])] },
    ];
    await saveFile(buildXls(sheets), 'PDMS_office_hierarchy.xls');
    say('Downloaded. Edit it in Excel, then Import Excel.');
  }

  const filePick = h('input', { id: 'editor-file', type: 'file', accept: 'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', hidden: true, onchange: async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const book = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
      const sheet = book.Sheets[SHEET_OFFICES] ?? book.Sheets[book.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
      const got = fromRows(rows);
      if (got.error) return say(`Not imported. ${got.error}`, true);
      const { unset, gone } = reconcile(got.tree, live);
      const text = `${got.notes.join(' ')} ${unset.length} e-GP offices would be Not set${gone.size ? `, and ${gone.size} linked offices aren't on e-GP now` : ''}. Replace the hierarchy with this file?`;
      if (!confirm(text)) return say('Not imported.');
      await commit({ tree: got.tree }, `Imported ${file.name}. ${got.notes.join(' ')}`);
      openTop();
      draw();
    } catch (err) {
      say(`That file couldn't be read: ${err.message}`, true);
    }
  } });

  draw();
  return h('div', { class: 'sheet', style: 'display:contents', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Office hierarchy' },
    h('header', { class: 'sheet-head' }, h('h2', {}, 'Office hierarchy'), h('button', { id: 'settings-close', type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: onClose }, icon('close'))),
    h('p', { class: 'settings-intro', title: `Checked against e-GP's office list ${liveFrom}.` }, 'Drag onto an office to put it under it; near its top or bottom edge, above or below. Alt + arrow keys move too.'),
    h('div', { class: 'sheet-search' }, icon('search'), search),
    h('div', { class: 'editor-tools' }, goneToggle, message),
    body,
    h('footer', { class: 'sheet-foot editor-foot' },
      h('small', { class: 'editor-live' }, `e-GP list: ${liveFrom}`),
      undoBtn,
      h('button', { id: 'editor-reset', type: 'button', class: 'btn text', onclick: () => {
        if (confirm('Go back to the hierarchy as it came with the tool? Your changes go, but Undo can bring them back.')) commit({ tree: copyTree(shipped) }, 'Back to the hierarchy as it came with the tool.');
      } }, 'Start over'),
      h('button', { id: 'editor-import', type: 'button', class: 'btn text', onclick: () => filePick.click() }, 'Import Excel'),
      h('button', { id: 'editor-export', type: 'button', class: 'btn filled', onclick: downloadExcel }, 'Export Excel'),
      filePick));
}
