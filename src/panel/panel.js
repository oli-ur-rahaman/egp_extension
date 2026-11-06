// Side panel controller. The page is the source of truth: each change goes to the page, then everything is read back (D18).

import { MSG, request } from '../shared/bus.js';
import { renderFlow, renderNoPage } from './view.js';

const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));
const versionEl = /** @type {HTMLElement} */ (document.getElementById('version'));
const screenEl = /** @type {HTMLElement} */ (document.getElementById('screen'));

/** @type {any} */
let current = null;
/** What only the panel holds, per page load: date ticks, All offices, the warning's answer, picker state. */
let session = freshSession();

function freshSession() {
  return {
    /** @type {string | null} */ key: null,
    /** @type {Record<string, any>} */ drafts: {},
    warningAccepted: false,
    /** @type {string | null} */ openTree: null,
    /** @type {Record<string, any[]>} */ treeNodes: {},
    /** @type {Set<string>} */ expanded: new Set(),
  };
}

/** @param {'pending' | 'ok' | 'error'} state @param {string} text */
function setStatus(state, text) {
  statusEl.dataset.state = state;
  statusEl.textContent = text;
}

/** @param {any} filter */
function initialValue(filter) {
  if (filter.control === 'dateRange') {
    const today = current.flow.rules.window?.filter === filter.id && current.flow.rules.window.currentDateCheckboxes;
    return { from: '', to: '', fromToday: !!today, toToday: !!today };
  }
  return undefined;
}

/** A filter's current value: the panel's draft where it holds one, or what the page says. @param {string} id */
function valueOf(id) {
  const filter = current.flow.filters.find((/** @type {any} */ f) => f.id === id);
  if (id in session.drafts) return session.drafts[id];
  const scan = current.page.filters.find((/** @type {any} */ s) => s.id === id);
  if (filter.control === 'dateRange') return initialValue(filter);
  if (filter.parts) return Object.fromEntries((scan?.parts ?? []).map((/** @type {any} */ p) => [p.role, p.value]));
  if (filter.control === 'tree') {
    if (filter.source === 'categoryTree') return { names: scan?.name ? [scan.name] : [] };
    return { id: scan?.value ?? '', name: scan?.name ?? '' };
  }
  return scan?.value ?? '';
}

/** What goes to the page. A date range sends its resolved ends. @param {any} filter @param {any} value */
function pageValue(filter, value) {
  if (filter.control !== 'dateRange') return value;
  const today = new Date();
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const text = `${p(today.getDate())}/${p(today.getMonth() + 1)}/${today.getFullYear()}`;
  return { from: value.fromToday ? text : value.from, to: value.toToday ? text : value.to };
}

/** @param {string} filterId @param {any} value */
async function change(filterId, value) {
  const filter = current.flow.filters.find((/** @type {any} */ f) => f.id === filterId);
  if (filter.allMeansLoop) {
    session.drafts[filterId] = value;
    if (value === '__all__') return render(); // Looping is the tool's job; the page keeps its own selection.
  } else if (filter.control === 'dateRange' || filter.parts || filter.control === 'tree') {
    session.drafts[filterId] = value;
  }
  setStatus('pending', 'Applying…');
  try {
    current = await request(MSG.PAGE_APPLY, { filterId, value: pageValue(filter, value) });
    setStatus('ok', 'Ready');
  } catch (err) {
    showError(err);
    return;
  }
  render();
}

/** @param {unknown} err */
function showError(err) {
  const text = String(err instanceof Error ? err.message : err);
  setStatus('error', text.startsWith('BLOCKED') ? 'Stopped' : 'Problem');
  const box = document.createElement('p');
  box.className = 'notice bad';
  box.id = 'error';
  box.textContent = `✕ ${text.replace(/^BLOCKED: /, '')}`;
  screenEl.prepend(box);
}

/** @param {string} filterId @param {string} key @param {string} id */
async function loadNodes(filterId, key, id) {
  const filter = current.flow.filters.find((/** @type {any} */ f) => f.id === filterId);
  try {
    const reply = /** @type {any} */ (await request(MSG.LOOKUP, { sourceId: filter.source, params: { id, ...(filter.source === 'departmentTree' ? { showPrNd: 'false' } : {}) } }));
    session.treeNodes[key] = reply.nodes;
    render();
  } catch (err) {
    showError(err);
  }
}

/** @param {any} filter @param {string} key */
function renderNodes(filter, key) {
  const nodes = session.treeNodes[key];
  const list = document.createElement('ul');
  list.className = 'tree';
  if (!nodes) {
    const waiting = document.createElement('li');
    waiting.textContent = 'Loading…';
    list.append(waiting);
    return list;
  }
  const isDepartment = filter.source === 'departmentTree';
  const chosen = isDepartment ? [] : valueOf(filter.id).names ?? [];
  for (const node of nodes) {
    const a = node.attr;
    const name = isDepartment ? a.dname : a.cpvname;
    const rawId = String(a.id).replace(/^deptid_/, '');
    const nodeKey = `${filter.id}:${rawId}`;
    const item = document.createElement('li');
    item.dataset.node = rawId;
    if (node.state === 'closed') {
      const twist = document.createElement('button');
      twist.type = 'button';
      twist.className = 'twist';
      const open = session.expanded.has(nodeKey);
      twist.textContent = open ? '−' : '+';
      twist.setAttribute('aria-label', `${open ? 'Close' : 'Open'} ${name}`);
      twist.addEventListener('click', () => {
        if (open) {
          session.expanded.delete(nodeKey);
          render();
        } else {
          session.expanded.add(nodeKey);
          if (session.treeNodes[nodeKey]) render();
          else loadNodes(filter.id, nodeKey, rawId);
        }
      });
      item.append(twist);
    }
    if (isDepartment) {
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'node';
      pick.textContent = name;
      pick.addEventListener('click', () => {
        session.openTree = null;
        change(filter.id, { id: rawId, name });
      });
      item.append(pick);
    } else {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = chosen.includes(name);
      box.addEventListener('change', () => {
        const names = box.checked ? [...chosen, name] : chosen.filter((/** @type {string} */ n) => n !== name);
        change(filter.id, { names });
      });
      label.append(box, ` ${name}`);
      item.append(label);
    }
    if (session.expanded.has(nodeKey)) item.append(renderNodes(filter, nodeKey));
    list.append(item);
  }
  return list;
}

const on = {
  change,
  /** @param {string} id */ draft: (id) => session.drafts[id] ?? (current.flow.filters.find((/** @type {any} */ f) => f.id === id)?.allMeansLoop ? '__all__' : undefined),
  /** @param {string} id */ value: (id) => (current.flow.filters.find((/** @type {any} */ f) => f.id === id)?.allMeansLoop ? (session.drafts[id] ?? '__all__') : valueOf(id)),
  warningAccepted: () => session.warningAccepted,
  acceptWarning: () => {
    session.warningAccepted = true;
    render();
  },
  /** @param {string} id */ treeOpen: (id) => session.openTree === id,
  /** @param {string} id */ openTree: (id) => {
    session.openTree = session.openTree === id ? null : id;
    const key = `${id}:root`;
    if (session.openTree === id && !session.treeNodes[key]) loadNodes(id, key, '0');
    render();
  },
  /** @param {any} filter */ renderTree: (filter) => renderNodes(filter, `${filter.id}:root`),
};

function render() {
  const focused = document.activeElement?.id;
  const scrollTop = document.documentElement.scrollTop;
  screenEl.replaceChildren(current.flowId ? renderFlow(current, on) : renderNoPage(current));
  if (focused) document.getElementById(focused)?.focus();
  document.documentElement.scrollTop = scrollTop;
}

async function refresh() {
  try {
    const state = /** @type {any} */ (await request(MSG.PAGE_STATE));
    const key = state.flowId ? `${state.tabId}|${state.url}` : null;
    if (key !== session.key) {
      session = freshSession();
      session.key = key;
    }
    current = state;
    setStatus('ok', 'Ready');
    render();
  } catch (err) {
    setStatus('error', 'Not connected');
    screenEl.replaceChildren();
    showError(err);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === MSG.PAGE_CHANGED) refresh();
});

request(MSG.PING).then((/** @type {any} */ reply) => {
  versionEl.textContent = `v${reply.version}`;
}, () => {});
refresh();
