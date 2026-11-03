// Side panel. A pure view: it asks the service worker for state and renders it.

import { MSG, request } from '../shared/bus.js';

const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));
const uptimeEl = /** @type {HTMLElement} */ (document.getElementById('sw-uptime'));
const versionEl = /** @type {HTMLElement} */ (document.getElementById('version'));

/**
 * @param {'pending' | 'ok' | 'error'} state
 * @param {string} text
 */
function setStatus(state, text) {
  statusEl.dataset.state = state;
  statusEl.textContent = text;
}

async function heartbeat() {
  try {
    /** @type {import('../shared/bus.js').PingReply} */
    const reply = await request(MSG.PING);
    setStatus('ok', 'Ready');
    versionEl.textContent = `v${reply.version}`;
    uptimeEl.textContent = `up ${Math.round(reply.uptimeMs / 1000)} s`;
  } catch (err) {
    setStatus('error', 'Not connected');
    uptimeEl.textContent = String(err instanceof Error ? err.message : err);
  }
}

heartbeat();
setInterval(heartbeat, 5000);
