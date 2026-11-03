// Minimal Chrome DevTools Protocol client. Uses Node's built-in fetch and WebSocket.

/**
 * @typedef {{ id: string, type: string, title: string, url: string, webSocketDebuggerUrl: string }} Target
 */

/** @param {number} port */
export async function browserVersion(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/version`);
  if (!res.ok) throw new Error(`CDP /json/version returned ${res.status}`);
  return /** @type {Record<string, string>} */ (await res.json());
}

/**
 * @param {number} port
 * @returns {Promise<Target[]>}
 */
export async function listPages(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!res.ok) throw new Error(`CDP /json/list returned ${res.status}`);
  const targets = /** @type {Target[]} */ (await res.json());
  return targets.filter((t) => t.type === 'page');
}

/**
 * Open a CDP session to one page target.
 * @param {string} wsUrl
 */
export function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  /** @type {Map<number, { resolve: (v: any) => void, reject: (e: Error) => void }>} */
  const pending = new Map();
  /** @type {Map<string, Array<(params: any) => void>>} */
  const listeners = new Map();

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const p = /** @type {{ resolve: (v: any) => void, reject: (e: Error) => void }} */ (pending.get(msg.id));
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${msg.error.message} (${msg.error.code})`));
      else p.resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
    }
  });

  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error(`could not open ${wsUrl}`)), { once: true });
  });

  return {
    opened,
    /**
     * @param {string} method
     * @param {Record<string, unknown>} [params]
     * @returns {Promise<any>}
     */
    send(method, params = {}) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    /**
     * @param {string} event
     * @param {(params: any) => void} fn
     */
    on(event, fn) {
      listeners.set(event, [...(listeners.get(event) ?? []), fn]);
    },
    close() {
      ws.close();
    },
  };
}
