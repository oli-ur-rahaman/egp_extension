// @ts-nocheck: the hierarchy is free-form JSON. Covered by tests/unit/office-tree-edit.test.js.
// D67: editing PWD's office hierarchy. Pure functions: the panel draws, these change the tree.
// A tree is { nodes: [{ id, name, level, egpId?, children }] }. Level is the depth: 1 Chief Engineer ... 5 Sub-division.

export const MAX_LEVEL = 5;
export const LEVEL_NAMES = { 1: 'Chief Engineer', 2: 'Zone', 3: 'Circle', 4: 'Division', 5: 'Sub-division' };
const LEVEL_OF_NAME = Object.fromEntries(Object.entries(LEVEL_NAMES).map(([k, v]) => [v.toLowerCase(), Number(k)]));

export const copyTree = (tree) => structuredClone(tree);

/** Calls fn(node, parentList, index, depth) for every node, depth first. */
export function eachNode(nodes, fn, depth = 1) {
  nodes.forEach((n, i) => {
    fn(n, nodes, i, depth);
    eachNode(n.children, fn, depth + 1);
  });
}

export function findNode(nodes, id) {
  let found = null;
  eachNode(nodes, (n, list, index, depth) => {
    if (!found && n.id === id) found = { node: n, list, index, depth };
  });
  return found;
}

/** How many levels a node and its branch take. */
export const heightOf = (node) => 1 + Math.max(0, ...node.children.map(heightOf));

const relevel = (nodes, depth = 1) => {
  for (const n of nodes) {
    n.level = depth;
    relevel(n.children, depth + 1);
  }
};

/**
 * Moves a node, with everything under it, before, after or inside another. Returns the new tree, or an error in plain words.
 * @param {any} tree @param {string} id @param {string} targetId @param {'before' | 'after' | 'inside'} where
 */
export function moveNode(tree, id, targetId, where) {
  if (id === targetId) return { error: 'An office can\'t be placed on itself.' };
  const next = copyTree(tree);
  const moving = findNode(next.nodes, id);
  if (!moving) return { error: 'That office is no longer in the hierarchy.' };
  if (findNode(moving.node.children, targetId)) return { error: 'An office can\'t be placed under one of its own offices.' };
  const target = findNode(next.nodes, targetId);
  if (!target) return { error: 'That place is no longer in the hierarchy.' };
  const depth = where === 'inside' ? target.depth + 1 : target.depth;
  if (depth - 1 + heightOf(moving.node) > MAX_LEVEL) return { error: `The hierarchy has ${MAX_LEVEL} levels, down to Sub-division. That would go deeper.` };
  moving.list.splice(moving.index, 1);
  const again = findNode(next.nodes, targetId);
  if (where === 'inside') again.node.children.push(moving.node);
  else again.list.splice(again.index + (where === 'after' ? 1 : 0), 0, moving.node);
  relevel(next.nodes);
  return { tree: next };
}

/** Puts an e-GP office that sits nowhere into the tree, as its own node. */
export function placeOffice(tree, office, targetId, where) {
  const next = copyTree(tree);
  const id = `egp-${office.value}`;
  if (findNode(next.nodes, id)) return moveNode(next, id, targetId, where);
  const holder = { id: '__holder__', name: '', level: 0, children: [] };
  next.nodes.push(holder);
  holder.children.push({ id, name: office.text, level: 0, egpId: office.value, egpName: office.text, children: [] });
  const moved = moveNode(next, id, targetId, where);
  if (moved.error) return moved;
  moved.tree.nodes = moved.tree.nodes.filter((n) => n.id !== '__holder__');
  return moved;
}

/**
 * Takes an office out of the tree, to Not set. A node with offices under it stays, as a heading, so they keep their place;
 * only its e-GP link goes.
 */
export function unsetOffice(tree, id) {
  const next = copyTree(tree);
  const found = findNode(next.nodes, id);
  if (!found) return { error: 'That office is no longer in the hierarchy.' };
  if (found.node.children.length) {
    delete found.node.egpId;
    delete found.node.egpName;
  } else {
    found.list.splice(found.index, 1);
  }
  return { tree: next };
}

/** Keyboard moves, as outline editors do: up, down, out a level, in under the one above. */
export function nudge(tree, id, key) {
  const found = findNode(tree.nodes, id);
  if (!found) return { error: 'That office is no longer in the hierarchy.' };
  const { list, index } = found;
  if (key === 'up' && index > 0) return moveNode(tree, id, list[index - 1].id, 'before');
  if (key === 'down' && index < list.length - 1) return moveNode(tree, id, list[index + 1].id, 'after');
  if (key === 'right' && index > 0) return moveNode(tree, id, list[index - 1].id, 'inside');
  if (key === 'left') {
    let parent = null;
    eachNode(tree.nodes, (n) => { if (n.children.some((c) => c.id === id)) parent = n; });
    if (parent) return moveNode(tree, id, parent.id, 'after');
  }
  return { tree };
}

/**
 * Matches the tree against the office list e-GP shows now (D67): offices new to the tree are Not set,
 * and offices in the tree that e-GP no longer lists are marked gone.
 * @param {any} tree @param {{ value: string, text: string }[]} live
 */
export function reconcile(tree, live) {
  const liveIds = new Set(live.map((o) => o.value));
  const inTree = new Set();
  const gone = new Set();
  eachNode(tree.nodes, (n) => {
    if (!n.egpId) return;
    inTree.add(n.egpId);
    if (!liveIds.has(n.egpId)) gone.add(n.id);
  });
  return { unset: live.filter((o) => !inTree.has(o.value)), gone };
}

// --- Excel, in the owner's own layout: Level, then the office, in tree order (D67)

export const SHEET_OFFICES = 'Office Hierarchy';
export const SHEET_EGP = 'e-GP offices';
export const HEADERS = ['Level', 'Office', 'e-GP office ID', 'Name on e-GP', 'On e-GP now'];

/** Rows for the Office Hierarchy sheet, then the Not set offices at the end with no level. */
export function toRows(tree, live) {
  const liveIds = new Set(live.map((o) => o.value));
  const rows = [];
  eachNode(tree.nodes, (n, _l, _i, depth) => {
    rows.push([LEVEL_NAMES[depth], `${'    '.repeat(depth - 1)}${n.name}`, n.egpId ?? '', n.egpName ?? '', n.egpId ? (liveIds.has(n.egpId) ? 'Yes' : 'No') : '']);
  });
  for (const o of reconcile(tree, live).unset) rows.push(['Not set', o.text, o.value, o.text, 'Yes']);
  return rows;
}

/**
 * Reads the sheet back. Rows are in tree order; each row's level says where it sits under the rows above it.
 * @param {any[][]} rows the sheet's rows, the header first
 * @returns {{ tree?: any, error?: string, notes: string[] }}
 */
export function fromRows(rows) {
  const notes = [];
  const head = (rows[0] ?? []).map((c) => String(c ?? '').trim().toLowerCase());
  const col = (name) => head.findIndex((h) => h.startsWith(name));
  const levelCol = col('level');
  const nameCol = head.findIndex((h) => h.startsWith('office'));
  const idCol = col('e-gp office id');
  if (levelCol < 0 || nameCol < 0) return { error: 'The sheet needs columns named Level and Office, as in the template.', notes };
  const nodes = [];
  const stack = [];
  const ids = new Set();
  let count = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const name = String(row[nameCol] ?? '').trim();
    const levelText = String(row[levelCol] ?? '').trim();
    if (!name && !levelText) continue;
    if (!name) return { error: `Row ${r + 1} has a level but no office name.`, notes };
    if (levelText.toLowerCase() === 'not set') continue;
    const level = LEVEL_OF_NAME[levelText.toLowerCase()] ?? Number(levelText);
    if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) return { error: `Row ${r + 1}: the level "${levelText}" isn't one of ${Object.values(LEVEL_NAMES).join(', ')}.`, notes };
    if (level > stack.length + 1) return { error: `Row ${r + 1}: "${name}" is a ${LEVEL_NAMES[level]}, but there is no ${LEVEL_NAMES[level - 1]} above it.`, notes };
    const egpId = idCol >= 0 ? String(row[idCol] ?? '').trim() : '';
    if (egpId && ids.has(egpId)) return { error: `Row ${r + 1}: e-GP office ID ${egpId} is given twice.`, notes };
    if (egpId) ids.add(egpId);
    count += 1;
    const node = { id: `x${r}`, name, level, children: [], ...(egpId ? { egpId, egpName: name } : {}) };
    stack.length = level - 1;
    (level === 1 ? nodes : stack[level - 2].children).push(node);
    stack[level - 1] = node;
  }
  if (!count) return { error: 'The sheet has no offices.', notes };
  notes.push(`${count} offices, ${ids.size} of them linked to e-GP.`);
  return { tree: { nodes }, notes };
}
