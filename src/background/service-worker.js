// Service worker: the brain. It owns the run (D47, M5) and connects the panel to the page in the user's tab.

import { MSG } from '../shared/bus.js';
import { progressOf } from '../shared/estimate.js';
import { reportCombos } from '../shared/report-plan.js';
import { createEngine, NetworkError, TabGone } from './engine.js';
import { createStore } from './store.js';
import { detectFlow, isPortal } from '../shared/flow-detect.js';
import { loadProfile } from '../shared/profile.js';

const startedAt = Date.now();

/** The same mark as the toolbar icon, shown on the page's tab while the panel is open on it (D46). */
const TAB_MARK = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="11" fill="#0b57d0"/><rect x="10" y="12" width="28" height="24" rx="3" fill="#fff"/><rect x="10" y="12" width="28" height="7" rx="3" fill="#a8c7fa"/><path d="M10 26h28M19.5 19v17M29 19v17" stroke="#0b57d0" stroke-width="2"/></svg>')}`;

/** Runs on the page. Puts the mark in place of the page's own tab icon, or puts the page's icon back. @param {boolean} on @param {string} href */
function setTabIcon(on, href) {
  const held = /** @type {any} */ (window);
  document.getElementById('egp-tab-mark')?.remove();
  if (on) {
    held.__egpTabIcons ??= [...document.getElementsByTagName('link')].filter((link) => link.relList.contains('icon'));
    for (const link of held.__egpTabIcons) link.remove();
    const mark = document.createElement('link');
    mark.id = 'egp-tab-mark';
    mark.rel = 'icon';
    mark.href = href;
    document.head.append(mark);
  } else if (held.__egpTabIcons) {
    document.head.append(...held.__egpTabIcons);
    held.__egpTabIcons = undefined;
  }
}

/** Shows or removes the tab's mark. A tab the extension can't reach (not e-GP) simply has none. @param {number} tabId @param {boolean} on */
function markTab(tabId, on) {
  chrome.action.setBadgeText({ tabId, text: on ? 'ON' : '' }).catch(() => {});
  chrome.scripting.executeScript({ target: { tabId }, func: setTabIcon, args: [on, TAB_MARK] }).catch(() => {});
}

/** Which tabs have the panel on, kept in session storage because this worker sleeps. */
const panelTabs = async () => /** @type {number[]} */ ((await chrome.storage.session.get('panelTabs')).panelTabs ?? []);
/** @param {number} tabId @param {boolean} on */
async function rememberPanelTab(tabId, on) {
  const tabs = (await panelTabs()).filter((id) => id !== tabId);
  await chrome.storage.session.set({ panelTabs: on ? [...tabs, tabId] : tabs });
}

// D43: the panel belongs to the tab where the user clicked the icon. It's off everywhere else, including new tabs,
// and stays on that tab as the user moves between pages in it.
const PANEL_PATH = chrome.runtime.getManifest().side_panel?.default_path ?? '';

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((err) => console.error('[sw] setPanelBehavior failed', err));
chrome.sidePanel
  .setOptions({ enabled: false })
  .catch((err) => console.error('[sw] setOptions failed', err));
chrome.action.setBadgeBackgroundColor({ color: '#0b57d0' }).catch(() => {});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  // Both calls start within the click: Chrome only lets a panel open from a user's gesture, so neither may wait for the other.
  chrome.sidePanel
    .setOptions({ tabId: tab.id, path: `${PANEL_PATH}?tab=${tab.id}`, enabled: true })
    .catch((err) => console.error('[sw] setOptions failed', err));
  chrome.sidePanel.open({ tabId: tab.id }).catch((err) => console.error('[sw] open failed', err));
  rememberPanelTab(tab.id, true).catch(() => {});
  markTab(tab.id, true);
});

// The panel holds a connection while it's open. Chrome also ends it on a move to another tab,
// so the panel counts as closed only if its own tab is still the one in front.
chrome.runtime.onConnect.addListener((port) => {
  const tabId = Number(port.name.split(':')[1]);
  if (!port.name.startsWith(`${MSG.PANEL_PORT}:`) || !tabId) return;
  port.onDisconnect.addListener(async () => {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab?.active) return;
    await rememberPanelTab(tabId, false);
    markTab(tabId, false);
    chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
  });
});

/** @type {Promise<any> | null} */
let profilePromise = null;
const getProfile = () => (profilePromise ??= loadProfile());

/**
 * The panel's own tab (D43), or without one the tab the user is looking at.
 * Works through the page the user reached; never opens a page itself (E13).
 * @param {number} [tabId]
 */
async function panelTab(tabId) {
  if (tabId) return chrome.tabs.get(tabId).catch(() => null);
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab ?? null;
}

/** @param {number} tabId */
async function ensureAgent(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content/agent.js'] });
}

/** @param {number} tabId @param {any} message */
async function askAgent(tabId, message) {
  await ensureAgent(tabId);
  const reply = await chrome.tabs.sendMessage(tabId, message);
  if (reply && reply.error) throw new Error(reply.error);
  return reply;
}

/** What the panel needs to know about each flow when no report page is open. @param {any} profile */
const flowList = (profile) => Object.values(/** @type {Record<string, any>} */ (profile.flows))
  .map((f) => ({ number: f.number, name: f.name, route: f.page.route, login: f.login.policy }))
  .sort((a, b) => a.number - b.number);

/** @param {number} [tabId] */
async function pageState(tabId) {
  const profile = await getProfile();
  const tab = await panelTab(tabId);
  const url = tab?.url ?? '';
  const flowId = detectFlow(profile, url);
  if (!tab?.id || !flowId) {
    return { onPortal: isPortal(profile, url), flowId: null, flows: flowList(profile) };
  }
  const flow = profile.flows[flowId];
  const page = await askAgent(tab.id, { type: MSG.AGENT_SCAN, profile, flow });
  return { onPortal: true, flowId, flow, page, tabId: tab.id, url };
}

// --- The run (M5). One at a time; its requests go through the agent on the run's tab, and that tab is never brought to the front.

const store = createStore();
/** @type {Promise<any> | null} */
let enginePromise = null;

/** A long wait mustn't let Chrome put this worker to sleep. @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => {
    const beat = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), 20000);
    setTimeout(() => {
      clearInterval(beat);
      resolve(undefined);
    }, ms);
  });
}

/** @param {any} run @param {any} message */
async function askForRun(run, message) {
  const profile = await getProfile();
  const flow = profile.flows[run.flowId];
  const tab = await chrome.tabs.get(run.tabId).catch(() => null);
  if (!tab?.id || !tab.url || !isPortal(profile, tab.url)) throw new TabGone();
  try {
    await ensureAgent(tab.id);
    // Each time, as a page reloaded during a run has a new agent.
    await chrome.tabs.sendMessage(tab.id, { type: MSG.AGENT_GUARD, on: true });
    const reply = await chrome.tabs.sendMessage(tab.id, { ...message, profile, flow });
    if (reply?.network) throw new NetworkError(reply.network);
    if (reply?.error) throw new Error(reply.error);
    return reply;
  } catch (err) {
    if (err instanceof NetworkError) throw err;
    if (!/Receiving end|Cannot access|No tab|Frame with ID|message channel|back\/forward/i.test(String(/** @type {any} */ (err)?.message))) throw err;
    // The page went away mid-request. If the tab is still on the portal, it was only reloaded or moved on: ask again.
    const now = await chrome.tabs.get(run.tabId).catch(() => null);
    if (now?.url && isPortal(profile, now.url)) throw new NetworkError('The page was reloaded during a request.');
    throw new TabGone();
  }
}

const transport = {
  /** @param {any} run @param {number} page @param {number} size */
  list: (/** @type {any} */ run, /** @type {number} */ page, /** @type {number} */ size, /** @type {any} */ fields) => askForRun(run, { type: MSG.AGENT_LIST, fields: fields ?? run.fields, page, size }),
  /** @param {any} run @param {any} row */
  detail: (run, row) => askForRun(run, { type: MSG.AGENT_DETAIL, open: row.open }),
  /** @param {any} run @param {any} office */
  report: (run, office) => askForRun(run, { type: MSG.AGENT_REPORT, fields: { ...run.fields, ...(office.fields ?? { [run.loop.field]: office.value, [run.loop.mirror]: office.text }) } }),
  /** @param {any} run */
  session: (run) => askForRun(run, { type: MSG.AGENT_SESSION }),
};

/** @param {any} run */
function showOnToolbar(run) {
  const running = run.status === 'running' || run.status === 'paused';
  const text = run.status === 'paused' ? '||' : running ? `${Math.floor(progressOf(run) * 100)}%` : 'ON';
  chrome.action.setBadgeText({ tabId: run.tabId, text }).catch(() => {});
}

/** @param {any} run */
function runChanged(run) {
  showOnToolbar(run);
  chrome.runtime.sendMessage({ type: MSG.RUN_CHANGED, tabId: run.tabId, runId: run.id }).catch(() => {});
}

/** A run has stopped by itself or ended: the page no longer needs the closing warning, and the user is told. Takes no focus (D47). @param {any} run */
function runEnded(run) {
  chrome.tabs.sendMessage(run.tabId, { type: MSG.AGENT_GUARD, on: false }).catch(() => {});
  if (run.pauseKind === 'user') return;
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: run.status === 'paused' ? 'eGP Extractor paused' : 'eGP Extractor finished',
    message: run.status === 'paused' ? run.reason ?? 'The run has paused.' : `${run.stats.rows.toLocaleString('en-US')} rows collected. Open the panel to download the Excel file.`,
  }).catch(() => {});
}

const getEngine = () => (enginePromise ??= getProfile().then(async (profile) => {
  const test = await chrome.storage.session.get('testPaceMs');
  const pacing = typeof test.testPaceMs === 'number' ? { ...profile.pageStates.pacing, paceMs: test.testPaceMs, jitterMs: 0, backoffSeconds: [1, 1, 1] } : profile.pageStates.pacing;
  return createEngine({ store, transport, sleep, pacing, onChange: runChanged, onEnd: runEnded });
}));

const isOpen = (/** @type {any} */ run) => run.status === 'running' || run.status === 'paused';

/** The run this panel should show: the tab's own, or an unfinished one left without a tab. @param {number} [tabId] */
async function runFor(tabId) {
  const runs = (await store.allRuns()).filter((/** @type {any} */ r) => !r.dismissed).sort((/** @type {any} */ a, /** @type {any} */ b) => b.startedAt - a.startedAt);
  const own = runs.find((/** @type {any} */ r) => r.tabId === tabId);
  if (own) return own;
  for (const run of runs) {
    if (!isOpen(run)) continue;
    const tab = await chrome.tabs.get(run.tabId).catch(() => null);
    if (!tab) return run;
  }
  return null;
}

/** Presses the page's own Search, so the user sees the same results there (D53). The tab isn't brought forward. @param {number} tabId @param {any} profile @param {any} flow */
function showSearchOnPage(tabId, profile, flow) {
  chrome.tabs.sendMessage(tabId, { type: MSG.AGENT_SEARCH, profile, flow }).catch(() => {});
}

/**
 * D66: several offices on a page that takes one. Each office is its own search; the first page of each gives its size.
 * @param {number} tabId @param {any} profile @param {any} flow @param {any} built @param {any} plan @param {any} several @param {number} size
 */
async function measureSeveral(tabId, profile, flow, built, plan, several, size) {
  const filter = flow.filters.find((/** @type {any} */ f) => f.id === several.filterId);
  const searches = [];
  let rows = 0;
  let pages = 0;
  for (const office of several.offices) {
    const fields = { ...built.fields, [filter.requestField]: office.value };
    const first = await askAgent(tabId, { type: MSG.AGENT_LIST, profile, flow, fields, page: 1, size });
    if (first.network) throw new Error(first.network);
    if (first.outcome === 'RATE_LIMITED') throw new Error('BLOCKED: the portal answered with a block or CAPTCHA. Stop and try later.');
    if (first.outcome !== 'OK' && first.outcome !== 'EMPTY') throw new Error(first.reason ?? "The portal's answer couldn't be read.");
    const total = first.outcome === 'EMPTY' ? 0 : first.totalPages ?? 1;
    // Exact for one page; for more, the last page's size isn't known until the run reaches it.
    rows += total <= 1 ? first.rows?.length ?? 0 : Math.round((total - 0.5) * size);
    pages += total;
    const officeRows = total <= 1 ? first.rows?.length ?? 0 : Math.round((total - 0.5) * size);
    searches.push({ key: office.value, fields: { [filter.requestField]: office.value }, labels: { office: office.text }, rows: officeRows, pages: total });
    await new Promise((r) => setTimeout(r, 300)); // polite between offices
  }
  const label = filter.label.replace(/^(Select|By) /, '');
  const shown = built.shown.map((/** @type {any} */ s) => (s.label === label ? { ...s, value: `${searches.length} offices: ${several.offices.map((/** @type {any} */ o) => o.text).join('; ')}` } : s));
  return { ...plan, shown, searches, approx: true, size, repeatSize: flow.list.repeatSweepSize, totalPages: pages, rows };
}

/** Works out how big the search is, with the one or two requests that takes (D27), before anything starts. */
async function measure(/** @type {any} */ { tabId, loops, several, categoryNames }) {
  const profile = await getProfile();
  const tab = await panelTab(tabId);
  const flowId = tab?.url ? detectFlow(profile, tab.url) : null;
  if (!tab?.id || !flowId) throw new Error('This tab is no longer on the report page.');
  const flow = profile.flows[flowId];
  const built = await askAgent(tab.id, { type: MSG.AGENT_BUILD, profile, flow, categoryNames });
  const plan = { tabId: tab.id, flowId, fields: built.fields, shown: built.shown, loggedIn: built.loggedIn, pacing: profile.pageStates.pacing };
  if (flow.report) {
    const wanted = loops ?? {};
    const { combos, sizes, currentYear } = reportCombos(flow, built, wanted, new Date());
    if (!combos.length) throw new Error(`No financial year up to the current one (${currentYear}) is on the page.`);
    // What the file says was searched: a filter on All says All, not what the page last showed.
    const shown = built.shown.map((/** @type {any} */ s) => {
      const filter = flow.filters.find((/** @type {any} */ f) => f.allMeansLoop && wanted[f.id] && f.label.replace(/^(Select|By) /, '') === s.label);
      if (!filter) return s;
      const want = wanted[filter.id];
      if (Array.isArray(want)) {
        const names = built.loops[filter.id].options.filter((/** @type {any} */ o) => want.includes(o.value)).map((/** @type {any} */ o) => o.text);
        return { ...s, value: `${names.length} offices: ${names.join('; ')}` };
      }
      return { ...s, value: filter.allLabel.replace(' ({n})', '').replace('{n}', '') };
    });
    const projectFilter = flow.filters.find((/** @type {any} */ f) => f.id === 'project');
    const chosen = projectFilter && built.fields[projectFilter.requestField] && built.fields[projectFilter.requestField] !== projectFilter.empty;
    const project = chosen ? built.fields[projectFilter.mirrorField] || shown.find((/** @type {any} */ s) => s.label === 'Project')?.value : null;
    return { ...plan, shown, offices: combos, sizes, project, rows: null, totalPages: combos.length };
  }
  const size = flow.list.request.defaultSize;
  if (several?.offices?.length > 1) return measureSeveral(tab.id, profile, flow, built, plan, several, size);
  const first = await askAgent(tab.id, { type: MSG.AGENT_LIST, profile, flow, fields: built.fields, page: 1, size });
  if (first.network) throw new Error(first.network);
  if (first.outcome === 'RATE_LIMITED') throw new Error('BLOCKED: the portal answered with a block or CAPTCHA. Stop and try later.');
  if (first.outcome !== 'OK' && first.outcome !== 'EMPTY') throw new Error(first.reason ?? "The portal's answer couldn't be read.");
  if (first.outcome === 'EMPTY') {
    showSearchOnPage(tab.id, profile, flow);
    return { ...plan, size, repeatSize: flow.list.repeatSweepSize, totalPages: 0, rows: 0 };
  }
  const totalPages = first.totalPages ?? 1;
  let lastRows = first.rows.length;
  if (totalPages > 1) {
    const last = await askAgent(tab.id, { type: MSG.AGENT_LIST, profile, flow, fields: built.fields, page: totalPages, size });
    if (last.network) throw new Error(last.network);
    lastRows = last.rows?.length ?? size;
  }
  showSearchOnPage(tab.id, profile, flow);
  return { ...plan, size, repeatSize: flow.list.repeatSweepSize, totalPages, rows: (totalPages - 1) * size + lastRows };
}

/** @type {Record<string, (payload: any) => unknown>} */
const handlers = {
  [MSG.RUN_MEASURE]: measure,
  [MSG.RUN_START]: async ({ plan, clusters, chosen, scope }) => {
    const running = (await store.allRuns()).find((/** @type {any} */ r) => r.status === 'running');
    if (running) throw new Error('A run is already going in another tab. Pause or stop it first.');
    // Only the finished runs the user has left behind are removed.
    for (const old of await store.allRuns()) if (old.dismissed) await store.deleteRun(old.id);
    await chrome.storage.session.set({ runAlive: true });
    return (await getEngine()).start({ ...plan, clusters, chosen, scope });
  },
  [MSG.RUN_STATE]: async ({ tabId }) => {
    const run = await runFor(tabId);
    if (run?.status === 'running') (await getEngine()).ensure(run.id);
    return { run };
  },
  [MSG.RUN_PAUSE]: async ({ runId }) => ({ run: await (await getEngine()).pause(runId) }),
  [MSG.RUN_RESUME]: async ({ runId, tabId }) => {
    await chrome.storage.session.set({ runAlive: true });
    return { run: await (await getEngine()).resume(runId, tabId) };
  },
  [MSG.RUN_STOP]: async ({ runId }) => ({ run: await (await getEngine()).stop(runId) }),
  [MSG.RUN_DISMISS]: async ({ runId }) => {
    const run = await store.getRun(runId);
    if (run) await store.saveRun({ ...run, dismissed: true });
    chrome.action.setBadgeText({ tabId: run?.tabId, text: 'ON' }).catch(() => {});
    return { ok: true };
  },

  [MSG.PING]: () => ({
    version: chrome.runtime.getManifest().version,
    startedAt,
    uptimeMs: Date.now() - startedAt,
  }),
  [MSG.PAGE_STATE]: (payload) => pageState(payload?.tabId),
  [MSG.PAGE_APPLY]: async ({ tabId, filterId, value }) => {
    const profile = await getProfile();
    const tab = await panelTab(tabId);
    const flowId = tab?.url ? detectFlow(profile, tab.url) : null;
    if (!tab?.id || !flowId) throw new Error('This tab is no longer on the report page.');
    const flow = profile.flows[flowId];
    const page = await askAgent(tab.id, { type: MSG.AGENT_APPLY, profile, flow, filterId, value });
    return { onPortal: true, flowId, flow, page, tabId: tab.id, url: tab.url };
  },
  [MSG.LOOKUP]: async ({ tabId, sourceId, params }) => {
    const profile = await getProfile();
    const tab = await panelTab(tabId);
    if (!tab?.id || !tab.url || !isPortal(profile, tab.url)) throw new Error('This tab is no longer on the report page.');
    const reply = await askAgent(tab.id, { type: MSG.AGENT_LOOKUP, profile, sourceId, params });
    return { nodes: reply };
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = msg && handlers[msg.type];
  if (!handler) return false;
  Promise.resolve()
    .then(() => handler(msg.payload))
    .then(sendResponse, (err) => sendResponse({ error: String(err && err.message ? err.message : err) }));
  return true; // keep the channel open for the async reply
});

/** Tells an open panel that a tab changed; the panel ignores other tabs. A closed panel is fine. @param {number} tabId */
function notifyPanel(tabId) {
  chrome.runtime.sendMessage({ type: MSG.PAGE_CHANGED, tabId }).catch(() => {});
}
chrome.tabs.onActivated.addListener(({ tabId }) => notifyPanel(tabId));
chrome.tabs.onUpdated.addListener(async (tabId, change) => {
  if (change.status !== 'complete') return;
  notifyPanel(tabId);
  // A new page in the tab brings its own icon back.
  if ((await panelTabs()).includes(tabId)) markTab(tabId, true);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  rememberPanelTab(tabId, false).catch(() => {});
});

/**
 * When this worker wakes: a run marked running is still wanted. If the session flag has gone, Chrome itself was closed,
 * so the user is asked to resume (M5-MC2). Otherwise only the worker slept, so it simply carries on.
 */
async function wakeRuns() {
  const runs = (await store.allRuns()).filter((/** @type {any} */ r) => r.status === 'running');
  if (!runs.length) return;
  const { runAlive } = await chrome.storage.session.get('runAlive');
  const engine = await getEngine();
  for (const run of runs) {
    if (runAlive) engine.ensure(run.id);
    else await engine.markInterrupted(run);
  }
}
chrome.alarms.create('run-watch', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(() => {
  wakeRuns().catch((err) => console.error('[sw] wakeRuns failed', err));
});
wakeRuns().catch((err) => console.error('[sw] wakeRuns failed', err));

// The network came back: a run that paused for it carries on by itself (M8-MC2).
self.addEventListener('online', async () => {
  const engine = await getEngine();
  for (const run of await store.allRuns()) if (run.status === 'paused' && run.pauseKind === 'network') await engine.resume(run.id);
});
