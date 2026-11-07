// Typed message bus shared by the panel, the service worker and content scripts.
// Every message is { type, payload }. Add new types to MSG; never send a bare string.

export const MSG = Object.freeze({
  PING: 'sw/ping',
  PANEL_PORT: 'panel-port',
  PAGE_STATE: 'sw/page-state',
  PAGE_APPLY: 'sw/page-apply',
  LOOKUP: 'sw/lookup',
  PAGE_CHANGED: 'panel/page-changed',
  AGENT_SCAN: 'agent/scan',
  AGENT_APPLY: 'agent/apply',
  AGENT_LOOKUP: 'agent/lookup',
  RUN_MEASURE: 'sw/run-measure',
  RUN_START: 'sw/run-start',
  RUN_STATE: 'sw/run-state',
  RUN_PAUSE: 'sw/run-pause',
  RUN_RESUME: 'sw/run-resume',
  RUN_STOP: 'sw/run-stop',
  RUN_DISMISS: 'sw/run-dismiss',
  RUN_CHANGED: 'panel/run-changed',
  AGENT_BUILD: 'agent/build',
  AGENT_LIST: 'agent/list',
  AGENT_DETAIL: 'agent/detail',
  AGENT_REPORT: 'agent/report',
  AGENT_SESSION: 'agent/session',
  AGENT_GUARD: 'agent/guard',
});

/**
 * @typedef {{ version: string, startedAt: number, uptimeMs: number }} PingReply
 */

/**
 * Send a request to the service worker and await its reply.
 * @template T
 * @param {string} type one of MSG
 * @param {unknown} [payload]
 * @returns {Promise<T>}
 */
export async function request(type, payload) {
  const reply = await chrome.runtime.sendMessage({ type, payload });
  if (reply && reply.error) throw new Error(reply.error);
  return reply;
}
