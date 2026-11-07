// Runs on a portal page only when the panel asks. Reads the page, applies filter changes, and makes the panel's lookups.
// Never touches the login or account forms, and sends nothing of the page anywhere but the panel.

import { MSG } from '../shared/bus.js';
import { classifyPage } from '../shared/sentinel.js';
import { applyDefaults, applyFilter, scanFilters } from './page-filters.js';

const state = /** @type {any} */ (window);

if (!state.__egpAgent) {
  state.__egpAgent = true;
  let defaultsDone = false;
  // Tells the panel when the page has been reloaded: what it remembers belongs to this loaded page.
  const loadId = crypto.randomUUID();

  /** A same-origin request, as the page itself would make. Stops at any sign of a block. @param {any} profile @param {string} url @param {any} [init] */
  async function request(profile, url, init) {
    const response = await fetch(url, { credentials: 'same-origin', ...init });
    const text = await response.text();
    const block = profile.pageStates.block;
    if (block.statuses.includes(response.status) || new RegExp(block.textPattern, 'i').test(text.slice(0, 20000))) {
      throw new Error('BLOCKED: the portal answered with a block or CAPTCHA. Stop and try later.');
    }
    if (!response.ok) throw new Error(`The portal answered ${response.status}.`);
    return text;
  }

  /** @param {any} profile @param {any} flow */
  function readPage(profile, flow) {
    if (!defaultsDone) {
      applyDefaults(document, flow);
      defaultsDone = true;
    }
    const hasLogout = !!document.querySelector(profile.pageStates.logoutLink);
    const hasLoginForm = !!document.querySelector(profile.pageStates.loginForm);
    return {
      loadId,
      loggedIn: hasLogout && !hasLoginForm,
      verdict: classifyPage({ doc: document, profile, flow, kind: 'filterPage', url: location.href }),
      filters: scanFilters(document, flow),
    };
  }

  /** @type {Record<string, (message: any) => Promise<any> | any>} */
  const handlers = {
    [MSG.AGENT_SCAN]: ({ profile, flow }) => readPage(profile, flow),
    [MSG.AGENT_APPLY]: async ({ profile, flow, filterId, value }) => {
      const { refilled } = await applyFilter({ doc: document, flow, profile, filterId, value, request: (url, init) => request(profile, url, init) });
      return { ...readPage(profile, flow), refilled };
    },
    [MSG.AGENT_LOOKUP]: async ({ profile, sourceId, params }) => {
      const source = profile.sharedSources[sourceId];
      if (!source) throw new Error(`Unknown lookup ${sourceId}`);
      const query = new URLSearchParams({ ...source.fixed, ...params }).toString();
      const text = source.method === 'GET'
        ? await request(profile, `${source.url}?${query}`)
        : await request(profile, source.url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: query });
      return source.answer === 'treeJson' ? JSON.parse(text) : text;
    },
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const handler = handlers[message?.type];
    if (!handler) return false;
    Promise.resolve()
      .then(() => handler(message))
      .then(sendResponse, (err) => sendResponse({ error: String(err?.message ?? err) }));
    return true;
  });
}
