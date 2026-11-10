// Side panel controller. The page is the source of truth: each change goes to the page, then everything is read back (D18).
// Chrome closes a tab's panel when the user moves to another tab, so what only the panel holds is saved per tab (D45).

import { MSG, request as send } from '../shared/bus.js';
import { BUILD_ID } from '../build-id.js';
import { h } from './icons.js';
import { buildPicker } from './picker.js';
import { buildOfficePicker } from './office-picker.js';
import { buildListPicker } from './list-picker.js';
import { buildOfficeEditor } from './office-editor.js';
import { isPwdList, loadOfficeTree, rememberLive, TREE_KEY } from '../shared/offices.js';
import { buildPlanSheet, renderRun } from './run-view.js';
import { buildWorkbook, fileName } from '../shared/export.js';
import { saveFile } from './save-file.js';
import { buildXlsx } from '../shared/xlsx-writer.js';
import { buildXls, XLS_MAX_COLS, XLS_MAX_ROWS } from '../shared/xls-writer.js';
import { loadProfile } from '../shared/profile.js';
import { createStore } from '../background/store.js';
import { banner, renderFlow, renderNoPage } from './view.js';

const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));
const versionEl = /** @type {HTMLElement} */ (document.getElementById('version'));
const screenEl = /** @type {HTMLElement} */ (document.getElementById('screen'));
const sheetEl = /** @type {HTMLElement} */ (document.getElementById('sheet'));
const progressEl = /** @type {HTMLElement} */ (document.getElementById('progress'));

/** The tab this panel belongs to (D43). Without one, as in the tests' plain page, it follows the tab in front. */
const ownTab = Number(new URLSearchParams(location.search).get('tab')) || null;

/** @param {string} type @param {Record<string, unknown>} [payload] */
const ask = (type, payload = {}) => send(type, { ...payload, tabId: ownTab });

/** @type {any} */
let current = null;
let session = freshSession();

function freshSession() {
  return {
    /** @type {string | null} */ key: null,
    /** @type {string | null} */ flowId: null,
    /** @type {Record<string, any>} */ drafts: {},
    warningAccepted: false,
    moreOpen: false,
    /** @type {string | null} */ openTree: null,
    /** @type {Record<string, any[]>} */ treeNodes: {},
    /** @type {Set<string>} */ expanded: new Set(),
    scrollTop: 0,
    sheetScrollTop: 0,
  };
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!current?.tabId) return;
    chrome.storage.session.set({ [`panel:${current.tabId}`]: { ...session, expanded: [...session.expanded] } }).catch(() => {});
  }, 100);
}

/** @param {number} tabId */
async function savedSession(tabId) {
  const saved = /** @type {any} */ ((await chrome.storage.session.get(`panel:${tabId}`))[`panel:${tabId}`]);
  return saved ? { ...freshSession(), ...saved, expanded: new Set(saved.expanded) } : null;
}

/** @param {'pending' | 'ok' | 'error'} state @param {string} text */
function setStatus(state, text) {
  statusEl.dataset.state = state;
  statusEl.textContent = text;
  progressEl.hidden = state !== 'pending';
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
  if (filter.allMeansLoop) return session.drafts[id] ?? '__all__';
  if (id in session.drafts) return session.drafts[id];
  const scan = current.page.filters.find((/** @type {any} */ s) => s.id === id);
  if (filter.control === 'dateRange') return initialValue(filter);
  if (filter.parts) return Object.fromEntries((scan?.parts ?? []).map((/** @type {any} */ p) => [p.role, p.value]));
  if (filter.control === 'tree') {
    if (filter.source === 'categoryTree') return { names: scan?.name ? [scan.name] : [] };
    return { id: scan?.value ?? '', name: scan?.name ?? '' };
  }
  // A list on its "no selection" entry has no value, whatever that entry's value is ('0' on some pages).
  if (scan?.options && !scan.options.some((/** @type {any} */ o) => o.value === scan.value)) return filter.empty ?? '';
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

/** @param {string} filterId @param {any} value @param {boolean} [redraw] */
async function change(filterId, value, redraw = true) {
  const filter = current.flow.filters.find((/** @type {any} */ f) => f.id === filterId);
  // A parent's change refills its children, so offices chosen from the old list no longer apply.
  for (const child of current.flow.filters.filter((/** @type {any} */ f) => f.dependsOn?.includes(filterId))) delete session.drafts[child.id];
  if (Array.isArray(value)) {
    // Several offices (D66): the tool loops them; the page shows no single one.
    session.drafts[filterId] = value;
    save();
    if (filter.allMeansLoop) return render();
    value = filter.empty ?? '';
  } else if (!filter.allMeansLoop && filter.control === 'select') {
    delete session.drafts[filterId];
  }
  if (filter.allMeansLoop) {
    session.drafts[filterId] = value;
    save();
    if (value === '__all__') return render(); // Looping is the tool's job; the page keeps its own selection.
  } else if (filter.control === 'dateRange' || filter.parts || filter.control === 'tree') {
    session.drafts[filterId] = value;
    save();
  }
  setStatus('pending', 'Applying…');
  try {
    current = await ask(MSG.PAGE_APPLY, { filterId, value: pageValue(filter, value) });
    setStatus('ok', 'Ready');
  } catch (err) {
    showError(err);
    return;
  }
  if (redraw) render();
}

/** Back to how the page started, one filter at a time. @param {any[]} filters */
async function clearAll(filters) {
  for (const filter of filters) {
    if (filter.control === 'dateRange') {
      delete session.drafts[filter.id];
      await change(filter.id, initialValue(filter), false);
      delete session.drafts[filter.id];
    } else if (filter.control === 'tree') {
      await change(filter.id, filter.source === 'categoryTree' ? { names: [] } : { id: '', name: '' }, false);
    } else if (filter.parts) {
      const value = valueOf(filter.id);
      await change(filter.id, { ...value, ...(filter.control === 'operatorValue' ? { value: '', value2: '' } : { text: '' }) }, false);
    } else if (filter.allMeansLoop) {
      session.drafts[filter.id] = '__all__';
    } else {
      delete session.drafts[filter.id];
      await change(filter.id, filter.default ?? filter.empty ?? '', false);
    }
  }
  save();
  render();
}

/** @param {unknown} err */
function showError(err) {
  const text = String(err instanceof Error ? err.message : err);
  const blocked = text.startsWith('BLOCKED');
  setStatus('error', blocked ? 'Stopped' : 'Problem');
  document.getElementById('error')?.remove();
  // After a block the rule is to stop, so no retry is offered.
  const box = blocked
    ? banner('bad', text.replace(/^BLOCKED: /, ''), 'Stopped')
    : banner('bad', text, 'Something went wrong', h('button', { type: 'button', class: 'btn', onclick: () => refresh() }, 'Try again'));
  box.id = 'error';
  screenEl.prepend(box);
  screenEl.scrollTop = 0;
}

/** @param {string} filterId @param {string} key @param {string} id */
async function loadNodes(filterId, key, id) {
  const filter = current.flow.filters.find((/** @type {any} */ f) => f.id === filterId);
  try {
    const reply = /** @type {any} */ (await ask(MSG.LOOKUP, { sourceId: filter.source, params: { id, ...(filter.source === 'departmentTree' ? { showPrNd: 'false' } : {}) } }));
    session.treeNodes[key] = reply.nodes;
    save();
    return reply.nodes;
  } catch (err) {
    if (String(/** @type {any} */ (err)?.message).startsWith('BLOCKED')) {
      closePicker();
      showError(err);
    }
    throw err;
  }
}

/** @param {string} id */
function openPicker(id) {
  const filter = current.flow.filters.find((/** @type {any} */ f) => f.id === id);
  if (session.openTree !== id) session.sheetScrollTop = 0;
  session.openTree = id;
  save();
  const value = valueOf(id);
  const picker = /** @type {any} */ (buildPicker({
    filter,
    multi: filter.source === 'categoryTree',
    chosen: value,
    nodes: (key) => session.treeNodes[key],
    load: (key, nodeId) => loadNodes(id, key, nodeId),
    expanded: session.expanded,
    onExpandChange: save,
    onPick: (picked) => {
      closePicker();
      change(id, picked);
    },
    onClose: closePicker,
    scrollTop: session.sheetScrollTop,
    onScroll: (top) => {
      session.sheetScrollTop = top;
      save();
    },
  }));
  sheetEl.replaceChildren(picker);
  sheetEl.hidden = false;
  picker.restore();
}

function closePicker() {
  const id = session.openTree;
  session.openTree = null;
  save();
  sheetEl.hidden = true;
  sheetEl.replaceChildren();
  if (id) document.getElementById(`f-${id}-open`)?.focus({ preventScroll: true });
}

const on = {
  change,
  clearAll,
  /** @param {string} id */ draft: (id) => session.drafts[id] ?? '__all__',
  value: valueOf,
  warningAccepted: () => session.warningAccepted,
  acceptWarning: () => {
    session.warningAccepted = true;
    save();
    render();
  },
  moreOpen: () => session.moreOpen,
  /** @param {boolean} open */ setMoreOpen: (open) => {
    session.moreOpen = open;
    save();
  },
  openTree: openPicker,
  startPlan,
  /** D66: the office picker applies to PWD's office lists. @param {string} id */
  officeTree: (id) => {
    const scan = current.page.filters.find((/** @type {any} */ s) => s.id === id);
    const pwd = officeTree && scan?.options && isPwdList(officeTree.tree, scan.options);
    if (pwd && JSON.stringify(officeTree.live?.options) !== JSON.stringify(scan.options)) {
      officeTree.live = { at: Date.now(), options: scan.options };
      rememberLive(scan.options);
    }
    return pwd ? officeTree : null;
  },
  openOffices,
  openList,
};

/** D68: years and projects, one or many. @param {string} id */
function openList(id) {
  const filter = current.flow.filters.find((/** @type {any} */ f) => f.id === id);
  const scan = current.page.filters.find((/** @type {any} */ s) => s.id === id);
  const value = valueOf(id);
  const sheet = /** @type {any} */ (buildListPicker({
    title: filter.label.replace(/^(Select|By) /, ''),
    noneText: filter.allLabel?.replace(' ({n})', '') ?? 'All',
    options: scan.options,
    chosen: Array.isArray(value) ? value : [],
    onClose: closePicker,
    onPick: (ids) => {
      closePicker();
      change(id, ids.length ? ids : filter.allMeansLoop ? '__all__' : filter.empty ?? '');
    },
  }));
  sheetEl.replaceChildren(sheet);
  sheetEl.hidden = false;
  sheet.restore();
}

// --- Offices (D66)

/** @type {any} */
let officeTree = null;
async function loadOffices() {
  try {
    officeTree = await loadOfficeTree();
  } catch {
    officeTree = null;
  }
}

/** @param {string} id */
function openOffices(id) {
  const filter = current.flow.filters.find((/** @type {any} */ f) => f.id === id);
  const scan = current.page.filters.find((/** @type {any} */ s) => s.id === id);
  const value = valueOf(id);
  const chosen = Array.isArray(value) ? value : value && value !== '__all__' && value !== (filter.empty ?? '') ? [value] : [];
  const sheet = /** @type {any} */ (buildOfficePicker({
    title: filter.label.replace(/^(Select|By) /, ''),
    tree: officeTree.tree,
    overrides: officeTree.overrides,
    options: scan.options,
    chosen,
    onClose: closePicker,
    onPick: (ids) => {
      closePicker();
      // Every office is the same as All, and quicker: one search, not one per office.
      const all = ids.length === 0 || ids.length === scan.options.length;
      if (all) change(id, filter.allMeansLoop ? '__all__' : filter.empty ?? '');
      else if (ids.length === 1) change(id, ids[0]);
      else change(id, ids);
    },
  }));
  sheetEl.replaceChildren(sheet);
  sheetEl.hidden = false;
  sheet.restore();
}

/** D67: the hierarchy editor, checked against the office list e-GP shows now, or last showed. */
async function openSettings() {
  await loadOffices();
  if (!officeTree) return;
  // The page in front, if it shows PWD's offices; else the list seen last; else the one the tool came with.
  const onPage = current?.page?.filters?.find((/** @type {any} */ s) => s.options && isPwdList(officeTree.tree, s.options))?.options;
  if (onPage) await rememberLive(onPage);
  const live = onPage ?? officeTree.live?.options ?? Object.entries(officeTree.shipped.egpOffices).map(([value, text]) => ({ value, text }));
  const liveFrom = onPage ? 'on this page now' : officeTree.live ? `on ${new Date(officeTree.live.at).toLocaleString('en-GB')}` : 'when the tool was built; open an e-GP page with the office list to check it now';
  sheetEl.replaceChildren(buildOfficeEditor({
    tree: officeTree.tree,
    shipped: officeTree.shipped,
    live,
    liveFrom,
    onSave: async (tree) => {
      await chrome.storage.local.set({ [TREE_KEY]: { nodes: tree.nodes } });
      await loadOffices();
    },
    onClose: () => {
      sheetEl.hidden = true;
      sheetEl.replaceChildren();
      if (current?.flowId && !shownRun) render();
    },
  }));
  sheetEl.hidden = false;
}
document.getElementById('settings')?.addEventListener('click', openSettings);

// --- The run

/** The run this panel is showing. @type {any} */
let shownRun = null;

/** Measures the search, then asks what to collect. Nothing starts until the user says so (D25, D27). @param {Record<string, any>} values @param {any} result */
async function startPlan(values, result) {
  setStatus('pending', 'Measuring this search…');
  try {
    // Dates ticked "current date" have to be on the page before it's read.
    for (const filter of current.flow.filters.filter((/** @type {any} */ f) => f.panel && f.control === 'dateRange')) {
      if (values[filter.id]?.fromToday || values[filter.id]?.toToday) current = await ask(MSG.PAGE_APPLY, { filterId: filter.id, value: pageValue(filter, values[filter.id]) });
    }
    const category = current.flow.filters.find((/** @type {any} */ f) => f.source === 'categoryTree');
    // true: every office or year; a list: those offices (D66); false: what the page has.
    const loops = Object.fromEntries(current.flow.filters.filter((/** @type {any} */ f) => f.allMeansLoop || f.multiPick).map((/** @type {any} */ f) => {
      const v = valueOf(f.id);
      return [f.id, v === '__all__' ? true : Array.isArray(v) ? v : false];
    }));
    /** Several offices chosen on a flow whose page takes one: each is its own search. */
    const several = current.flow.filters.filter((/** @type {any} */ f) => !f.allMeansLoop && !f.multiPick && Array.isArray(valueOf(f.id))).map((/** @type {any} */ f) => {
      const scan = current.page.filters.find((/** @type {any} */ s) => s.id === f.id);
      return { filterId: f.id, offices: valueOf(f.id).map((/** @type {string} */ v) => scan.options.find((/** @type {any} */ o) => o.value === v)).filter(Boolean) };
    })[0] ?? null;
    const plan = /** @type {any} */ (await ask(MSG.RUN_MEASURE, { loops, several, categoryNames: category ? values[category.id]?.names ?? [] : [] }));
    setStatus('ok', 'Ready');
    const key = `fields:${current.flowId}`;
    const remembered = /** @type {string[]} */ ((await chrome.storage.local.get(key))[key] ?? []);
    const limit = result.exemptionUsed ? result.maxRows : null;
    sheetEl.replaceChildren(buildPlanSheet({
      flow: current.flow,
      plan,
      remembered,
      limit,
      onClose: closeSheet,
      onStart: async (/** @type {string[]} */ clusters, /** @type {string[]} */ chosen, /** @type {any} */ choice) => {
        await chrome.storage.local.set({ [key]: chosen });
        try {
          shownRun = /** @type {any} */ (await ask(MSG.RUN_START, { plan, clusters, chosen, ...(choice ?? {}) }));
          closeSheet();
          drawRun();
        } catch (err) {
          closeSheet();
          showError(err);
        }
      },
    }));
    sheetEl.hidden = false;
  } catch (err) {
    showError(err);
  }
}

function closeSheet() {
  sheetEl.hidden = true;
  sheetEl.replaceChildren();
  document.getElementById('start')?.focus({ preventScroll: true });
}

const runActions = {
  /** @param {string} type @param {any} [extra] */
  async send(type, extra = {}) {
    try {
      const reply = /** @type {any} */ (await ask(type, { runId: shownRun.id, ...extra }));
      if (reply.run) shownRun = reply.run;
      drawRun();
    } catch (err) {
      showError(err);
    }
  },
  pause: () => runActions.send(MSG.RUN_PAUSE),
  resume: () => runActions.send(MSG.RUN_RESUME, { tabId: ownTab ?? undefined }),
  stop: () => runActions.send(MSG.RUN_STOP),
  async finishAndClear() {
    await ask(MSG.RUN_DISMISS, { runId: shownRun.id });
    shownRun = null;
    refresh();
  },
  async download() {
    setStatus('pending', 'Making the Excel file…');
    try {
      const profile = await loadProfile();
      const rows = await createStore().allRows(shownRun.id);
      const flow = profile.flows[shownRun.flowId];
      const sheets = buildWorkbook({ flow, run: shownRun, rows, toolVersion: chrome.runtime.getManifest().version, profileVersion: profile.profileVersion, siteHost: profile.site.host });
      // D54: .xls, unless the file is too big for that format.
      const fits = sheets.every((sheet) => sheet.rows.length <= XLS_MAX_ROWS && Math.max(0, ...sheet.rows.map((r) => r.length)) <= XLS_MAX_COLS);
      const blob = fits ? buildXls(sheets) : await buildXlsx(sheets);
      await saveFile(blob, fileName(flow, shownRun, shownRun.flowId, fits ? 'xls' : 'xlsx'));
      setStatus('ok', 'Ready');
    } catch (err) {
      showError(err);
    }
  },
};

/** The run's screen, which replaces the filters until the user has finished with it. */
function drawRun() {
  screenEl.replaceChildren(renderRun(shownRun, runActions, (shownRun.flowName ?? current?.flow?.name)));
  setStatus(shownRun.status === 'running' ? 'pending' : 'ok', shownRun.status === 'running' ? 'Collecting…' : 'Ready');
  progressEl.hidden = true;
}

/** @returns {Promise<boolean>} true when a run has the screen */
/** Answers can arrive out of order when a run moves fast; only the newest request's answer is drawn. */
let runAsk = 0;
async function checkRun() {
  const mine = ++runAsk;
  const { run } = /** @type {any} */ (await ask(MSG.RUN_STATE));
  const profile = run ? await loadProfile() : null;
  if (mine !== runAsk) return !!shownRun;
  shownRun = run;
  if (!run) return false;
  shownRun = { ...run, flowName: profile?.flows[run.flowId].name };
  drawRun();
  return true;
}

/** The filters on screen. Those inside a closed fold take no space. @returns {HTMLElement[]} */
function shownFilters() {
  return /** @type {HTMLElement[]} */ ([...screenEl.getElementsByClassName('filter')]).filter((el) => el.getClientRects().length > 0);
}

/** The filter that must not move in a redraw: the one in use, or else the first one in view. */
function steadyFilter() {
  const shown = shownFilters();
  const inUse = /** @type {HTMLElement | null | undefined} */ (document.activeElement?.closest('.filter'));
  const viewTop = screenEl.getBoundingClientRect().top;
  const el = inUse && shown.includes(inUse) ? inUse : shown.find((f) => f.getBoundingClientRect().bottom > viewTop);
  return el ? { id: el.dataset.filter, top: el.getBoundingClientRect().top } : null;
}

function render() {
  const active = /** @type {HTMLInputElement | null} */ (document.activeElement);
  const focused = active?.id;
  // A long list the user has open, perhaps with words typed in it, is still open after the redraw.
  const openList = active?.getAttribute('role') === 'combobox' && active.getAttribute('aria-expanded') === 'true'
    ? { typed: active.value, scrollTop: document.getElementById(`${focused}-list`)?.scrollTop ?? 0 } : null;
  // Words being typed aren't on the page yet, so a redraw mustn't lose them.
  const typing = active?.tagName === 'INPUT' && active.type === 'text' && !openList ? { value: active.value, start: active.selectionStart, end: active.selectionEnd } : null;
  const steady = steadyFilter();
  const { scrollTop } = screenEl;
  screenEl.replaceChildren(current.flowId ? renderFlow(current, on) : renderNoPage(current));
  screenEl.scrollTop = scrollTop;
  // A filter above may have grown or shrunk, so the one that matters is put back where it was.
  const same = steady && shownFilters().find((f) => f.dataset.filter === steady.id);
  if (same) screenEl.scrollTop += same.getBoundingClientRect().top - steady.top;
  if (!focused || focused.startsWith('picker')) return;
  const box = /** @type {HTMLInputElement | null} */ (document.getElementById(focused));
  box?.focus({ preventScroll: true });
  if (box && typing && box.value !== typing.value && !box.disabled) {
    box.value = typing.value;
    box.setSelectionRange(typing.start, typing.end);
  }
  if (!box || !openList) return;
  box.click();
  if (box.value !== openList.typed) {
    box.value = openList.typed;
    box.dispatchEvent(new Event('input'));
  }
  const list = document.getElementById(`${focused}-list`);
  if (list) list.scrollTop = openList.scrollTop;
}

screenEl.addEventListener('scroll', () => {
  session.scrollTop = screenEl.scrollTop;
  save();
}, { passive: true });

async function refresh() {
  try {
    if (await checkRun()) return;
    const state = /** @type {any} */ (await ask(MSG.PAGE_STATE));
    // What's remembered belongs to one loaded page: a reload gives a clean page, so it starts clean too.
    const key = state.flowId ? `${state.tabId}|${state.url}|${state.page.loadId}` : null;
    let restored = false;
    if (key !== session.key) {
      const saved = state.tabId ? await savedSession(state.tabId) : null;
      if (saved?.key === key) {
        session = saved;
        restored = true;
      } else {
        closePicker();
        const warned = saved?.flowId === state.flowId && saved?.warningAccepted;
        session = freshSession();
        session.key = key;
        session.flowId = state.flowId;
        session.warningAccepted = !!warned;
      }
    }
    current = state;
    save();
    setStatus('ok', 'Ready');
    render();
    if (restored) {
      screenEl.scrollTop = session.scrollTop;
      if (session.openTree) openPicker(session.openTree);
    }
  } catch (err) {
    screenEl.replaceChildren();
    showError(err);
    setStatus('error', 'Not connected');
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === MSG.RUN_CHANGED) {
    if (shownRun?.id === message.runId || (!ownTab || message.tabId === ownTab)) checkRun().catch(() => {});
    return;
  }
  if (message?.type !== MSG.PAGE_CHANGED) return;
  if (shownRun) return;
  if (!ownTab || message.tabId === ownTab) refresh();
});

/** Tells the worker the panel is open. The worker sleeps when idle, which ends the connection, so it's made again. */
function holdConnection() {
  if (!ownTab) return;
  chrome.runtime.connect({ name: `${MSG.PANEL_PORT}:${ownTab}` }).onDisconnect.addListener(() => setTimeout(holdConnection, 200));
}
holdConnection();

loadOffices();
ask(MSG.PING).then((/** @type {any} */ reply) => {
  versionEl.textContent = `v${reply.version}`;
  // D71: a build written to disk while Chrome runs gives a new panel and an old background, which would quietly ignore new choices.
  if (reply.buildId !== BUILD_ID) showStaleBuild();
}, () => {});

function showStaleBuild() {
  document.body.classList.add('stale-build');
  // Chrome's own page, at this extension's card: its reload arrow always works. A run going is paused by it and can be resumed.
  const reload = h('button', { id: 'reload-extension', type: 'button', class: 'btn filled', onclick: () => {
    chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
  } }, 'Open the reload button');
  const box = banner('bad', 'The extension was rebuilt but not reloaded, so the panel and the part that runs searches are different versions, and choices made here could be ignored. On the page this opens, press the round reload arrow on PDMS, then open the panel again.', 'Reload needed', reload);
  box.id = 'stale-build';
  document.body.prepend(box);
}
refresh();
