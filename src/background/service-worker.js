// Service worker: the brain. It will own all run state (M5). For now it connects the panel to the page in the user's tab.

import { MSG } from '../shared/bus.js';
import { detectFlow, isPortal } from '../shared/flow-detect.js';
import { loadProfile } from '../shared/profile.js';

const startedAt = Date.now();

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('[sw] setPanelBehavior failed', err));

/** @type {Promise<any> | null} */
let profilePromise = null;
const getProfile = () => (profilePromise ??= loadProfile());

/** The tab the user is looking at. Works through the page the user reached; never opens a page itself (E13). */
async function userTab() {
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

async function pageState() {
  const profile = await getProfile();
  const tab = await userTab();
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
  [MSG.PAGE_STATE]: () => pageState(),
  [MSG.PAGE_APPLY]: async ({ filterId, value }) => {
    const profile = await getProfile();
    const tab = await userTab();
    const flowId = tab?.url ? detectFlow(profile, tab.url) : null;
    if (!tab?.id || !flowId) throw new Error('The report page is no longer in front.');
    const flow = profile.flows[flowId];
    const page = await askAgent(tab.id, { type: MSG.AGENT_APPLY, profile, flow, filterId, value });
    return { onPortal: true, flowId, flow, page, tabId: tab.id, url: tab.url };
  },
  [MSG.LOOKUP]: async ({ sourceId, params }) => {
    const profile = await getProfile();
    const tab = await userTab();
    if (!tab?.id || !tab.url || !isPortal(profile, tab.url)) throw new Error('The report page is no longer in front.');
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

/** Tells an open panel to look again. A closed panel is fine. */
function notifyPanel() {
  chrome.runtime.sendMessage({ type: MSG.PAGE_CHANGED }).catch(() => {});
}
chrome.tabs.onActivated.addListener(notifyPanel);
chrome.tabs.onUpdated.addListener((_tabId, change) => {
  if (change.status === 'complete') notifyPanel();
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) notifyPanel();
});
