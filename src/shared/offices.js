// @ts-nocheck: the hierarchy file is free-form JSON. Covered by tests/unit/offices.test.js.
// D66: PWD's offices as the owner's hierarchy places them. The shipped tree comes from profiles/pwd-offices.json;
// the user's own placements, made in the Office hierarchy screen, are kept in the browser and win.

export const TREE_KEY = 'officeTree';
export const LIVE_KEY = 'officesLive';

/**
 * Reads the hierarchy: the user's own (D67) if they've changed it, else the one shipped. Panel only.
 * The known e-GP offices are the shipped list plus any the user's tree links.
 */
export async function loadOfficeTree() {
  const response = await fetch(chrome.runtime.getURL('profiles/pwd-offices.json'));
  const shipped = await response.json();
  const got = await chrome.storage.local.get([TREE_KEY, LIVE_KEY]);
  const own = got[TREE_KEY];
  const tree = own ? { ...shipped, nodes: own.nodes } : shipped;
  const egpOffices = { ...shipped.egpOffices };
  const walk = (nodes) => nodes.forEach((n) => { if (n.egpId) egpOffices[n.egpId] = n.egpName ?? n.name; walk(n.children); });
  walk(tree.nodes);
  return { tree: { ...tree, egpOffices }, shipped, overrides: {}, live: got[LIVE_KEY] ?? null };
}

/** Remembers the office list e-GP showed last, for the hierarchy screen. */
export async function rememberLive(options) {
  await chrome.storage.local.set({ [LIVE_KEY]: { at: Date.now(), options } });
}

/** Every node, with the path of names above it. */
export function flatNodes(tree) {
  const out = [];
  const walk = (nodes, path) => {
    for (const n of nodes) {
      out.push({ node: n, path });
      walk(n.children, [...path, n.name]);
    }
  };
  walk(tree.nodes, []);
  return out;
}

/** True when a list holds PWD's offices: most of its IDs are in the tree. @param {{ value: string }[]} options */
export function isPwdList(tree, options) {
  if (!options?.length) return false;
  const known = options.filter((o) => o.value in tree.egpOffices).length;
  return known >= Math.max(2, options.length / 2);
}

/**
 * The tree as the picker shows it: only branches holding an office in the live list, with each node's own office first.
 * overrides: { [officeId]: nodeId | null }, null meaning "not in the hierarchy".
 * @param {any} tree
 * @param {Record<string, string | null>} overrides
 * @param {{ value: string, text: string }[]} options the live list
 */
export function placeOffices(tree, overrides, options) {
  const live = new Map(options.map((o) => [o.value, o]));
  const extra = new Map(); // nodeId -> offices the user placed under it
  for (const [office, nodeId] of Object.entries(overrides)) if (nodeId) extra.set(nodeId, [...(extra.get(nodeId) ?? []), office]);
  const used = new Set();
  const levels = { 2: [], 3: [], 4: [], 5: [] };
  const build = (node, level) => {
    const own = node.egpId && !(node.egpId in overrides) && live.has(node.egpId) ? live.get(node.egpId) : null;
    if (own) {
      used.add(own.value);
      levels[level]?.push(own.value);
    }
    const children = node.children.map((c) => build(c, c.level)).filter(Boolean);
    for (const id of extra.get(node.id) ?? []) {
      if (!live.has(id) || used.has(id)) continue;
      used.add(id);
      levels[level + 1]?.push(id);
      children.push({ id: `placed-${id}`, name: live.get(id).text, level: level + 1, office: live.get(id), children: [] });
    }
    if (!own && !children.length) return null;
    return { id: node.id, name: node.name, level, office: own, children };
  };
  const roots = tree.nodes.map((n) => build(n, n.level)).filter(Boolean);
  const unplaced = options.filter((o) => !used.has(o.value));
  return { roots, unplaced, levels };
}

/** Every office ID at or under a node. */
export function officesUnder(node) {
  const out = node.office ? [node.office.value] : [];
  for (const c of node.children) out.push(...officesUnder(c));
  return out;
}
