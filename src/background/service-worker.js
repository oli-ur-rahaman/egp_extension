// Service worker: the brain. It will own all run state (M5). For M0 it only
// opens the side panel from the toolbar icon and answers the panel's heartbeat.

import { MSG } from '../shared/bus.js';

const startedAt = Date.now();

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('[sw] setPanelBehavior failed', err));

/** @type {Record<string, (payload: unknown) => unknown>} */
const handlers = {
  [MSG.PING]: () => ({
    version: chrome.runtime.getManifest().version,
    startedAt,
    uptimeMs: Date.now() - startedAt,
  }),
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = msg && handlers[msg.type];
  if (!handler) {
    sendResponse({ error: `unknown message type: ${msg && msg.type}` });
    return false;
  }
  Promise.resolve()
    .then(() => handler(msg.payload))
    .then(sendResponse, (err) => sendResponse({ error: String(err && err.message ? err.message : err) }));
  return true; // keep the channel open for the async reply
});
