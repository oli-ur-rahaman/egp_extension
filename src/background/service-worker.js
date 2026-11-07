// Service worker: the brain. It will own all run state (M5). For now it connects the panel to the page in the user's tab.

import { MSG } from '../shared/bus.js';
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

/** @type {Record<string, (payload: any) => unknown>} */
const handlers = {
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
