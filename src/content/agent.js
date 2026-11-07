// Runs on a portal page only when the panel or a run asks. Reads the page, applies filter changes, and makes the panel's and the run's requests.
// Never touches the login or account forms, and sends nothing of the page anywhere but this extension.
// Requests go out as the page itself would make them, one at a time, so no extra tab opens and the user's other tabs are left alone (D47).

import { MSG } from '../shared/bus.js';
import { parseDetail, parseList, parseReport } from '../shared/page-parse.js';
import { classifyPage, OUTCOME } from '../shared/sentinel.js';
import { applyDefaults, applyFilter, buildRequest, scanFilters } from './page-filters.js';

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

  /** One request of a run. A network failure is an answer too, so the run can decide what to do. @param {any} profile @param {string} url @param {any} init @returns {Promise<any>} */
  async function fetchAnswer(profile, url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), profile.pageStates.slowResponseMs);
    try {
      const response = await fetch(url, { credentials: 'same-origin', ...init, signal: controller.signal });
      return { text: await response.text(), status: response.status, url: response.url };
    } catch (err) {
      return { failed: String(/** @type {any} */ (err)?.name === 'AbortError' ? 'The portal took too long to answer.' : 'The network request failed.') };
    } finally {
      clearTimeout(timer);
    }
  }

  /** A document nothing runs in, with scripts gone: only what a page shows counts (D41, insight 85). @param {string} html */
  function readHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const tag of ['script', 'style', 'noscript']) for (const el of [...doc.getElementsByTagName(tag)]) el.remove();
    return doc;
  }

  const form = (/** @type {Record<string, string>} */ fields) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });

  /** @param {any} profile @param {any} flow @param {Record<string, string>} fields @param {number} page @param {number} size */
  async function listPage(profile, flow, fields, page, size) {
    const { request: req, tableId } = flow.list;
    const answer = await fetchAnswer(profile, req.url, form({ ...fields, ...req.fixed, [req.pageField]: String(page), [req.sizeField]: String(size) }));
    if (answer.failed) return { network: answer.failed };
    // Lists answer with bare rows. Anything else that came back is a whole page, read as it is.
    const fragment = !/<html[\s>]/i.test(answer.text);
    const doc = readHtml(fragment ? `<!doctype html><html><head><title></title></head><body><table id="${tableId}"><tbody>${answer.text}</tbody></table></body></html>` : answer.text);
    const verdict = classifyPage({ doc, profile, flow, kind: 'list', url: answer.url, status: answer.status });
    if (verdict.outcome === OUTCOME.SHAPE_CHANGED && doc.querySelector(profile.pageStates.loginForm)) return { outcome: OUTCOME.LOGIN_WALL };
    if (verdict.outcome !== OUTCOME.OK && verdict.outcome !== OUTCOME.EMPTY) return { outcome: verdict.outcome, reason: verdict.reason };
    return { outcome: verdict.outcome, ...parseList(doc, flow) };
  }

  /** @type {((event: BeforeUnloadEvent) => void) | null} */
  let guard = null;

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
    [MSG.AGENT_BUILD]: async ({ profile, flow, categoryNames }) => {
      const built = buildRequest(document, flow);
      const category = flow.filters.find((/** @type {any} */ f) => f.source === 'categoryTree');
      if (category && categoryNames?.length) {
        // The page sends a chosen category with those under it, by name (flow-2 notes).
        const source = profile.sharedSources.categoryExpansion;
        const expanded = [];
        for (const name of categoryNames) {
          const query = new URLSearchParams({ ...source.fixed, [source.params[0]]: name }).toString();
          const text = (await request(profile, `${source.url}?${query}`)).trim();
          expanded.push(name, ...(text && text !== name ? [text] : []));
        }
        built.fields[category.requestField] = expanded.join('; ');
      }
      return { ...built, loggedIn: readPage(profile, flow).loggedIn };
    },
    [MSG.AGENT_LIST]: async ({ profile, flow, fields, page, size }) => listPage(profile, flow, fields, page, size),
    [MSG.AGENT_DETAIL]: async ({ profile, flow, open }) => {
      const { url, method } = flow.detail.open;
      const query = new URLSearchParams(open).toString();
      const answer = await fetchAnswer(profile, method === 'GET' ? `${url}?${query}` : url, method === 'GET' ? {} : form(open));
      if (answer.failed) return { network: answer.failed };
      const doc = readHtml(answer.text);
      const verdict = classifyPage({ doc, profile, flow, kind: 'detail', url: answer.url, status: answer.status });
      if (verdict.outcome !== OUTCOME.OK) return { outcome: verdict.outcome, reason: verdict.reason };
      return { outcome: OUTCOME.OK, ...parseDetail(doc, flow) };
    },
    [MSG.AGENT_REPORT]: async ({ profile, flow, fields }) => {
      const { url, fixed } = flow.report.request;
      const answer = await fetchAnswer(profile, url, form({ ...fields, ...fixed }));
      if (answer.failed) return { network: answer.failed };
      const doc = readHtml(answer.text);
      const verdict = classifyPage({ doc, profile, flow, kind: 'report', url: answer.url, status: answer.status });
      if (verdict.outcome !== OUTCOME.OK && verdict.outcome !== OUTCOME.EMPTY) return { outcome: verdict.outcome, reason: verdict.reason };
      return { outcome: verdict.outcome, ...parseReport(doc, flow) };
    },
    // A page can show Logout after the session has ended, so ask the portal (insight 64).
    [MSG.AGENT_SESSION]: async ({ profile }) => {
      const answer = await fetchAnswer(profile, profile.pageStates.sessionCheckUrl, {});
      if (answer.failed) return { network: answer.failed };
      if (answer.url.includes(profile.pageStates.sessionEnded.urlContains)) return { loggedIn: false };
      const doc = readHtml(answer.text);
      return { loggedIn: !!doc.querySelector(profile.pageStates.logoutLink) && !doc.querySelector(profile.pageStates.loginForm) };
    },
    // D48: closing a tab that's running asks first. Chrome only asks if the user has clicked inside the page.
    [MSG.AGENT_GUARD]: ({ on }) => {
      if (on && !guard) {
        guard = (event) => event.preventDefault();
        addEventListener('beforeunload', guard);
      } else if (!on && guard) {
        removeEventListener('beforeunload', guard);
        guard = null;
      }
      return { on: !!guard };
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
