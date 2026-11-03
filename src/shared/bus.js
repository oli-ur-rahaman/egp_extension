// Typed message bus shared by the panel, the service worker and content scripts.
// Every message is { type, payload }. Add new types to MSG; never send a bare string.

export const MSG = Object.freeze({
  PING: 'sw/ping',
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
