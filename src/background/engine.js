// @ts-nocheck: run records are free-form JSON. Behaviour is covered by tests/unit/engine.test.js.
// M5: the run. One request at a time, each result saved before the next is asked for, so a run survives a closed tab, a closed browser
// or a lost network with nothing lost. It never touches a tab's focus (D47). Portal knowledge comes through `transport`.

/** Why a run stopped by itself, in plain words. */
const PAUSE_TEXT = {
  login: 'The session has ended. Log in to e-GP in this tab, then press Resume.',
  account: 'The portal is asking for account details. Press Update Later on the page, then press Resume.',
  block: 'The portal answered with a block or CAPTCHA. The run stopped at once and will not retry by itself. Everything so far is saved. Try again later.',
  network: "The portal isn't answering. Everything so far is saved. The run carries on when the network returns, or press Resume.",
  shape: "The portal's page has changed, so reading it could give wrong data. The run stopped. Everything so far is saved.",
  tab: 'The e-GP tab was closed or left the portal. Everything so far is saved. Open e-GP in a tab, open this panel there, and press Resume.',
  chrome: 'Chrome was closed during the run. Everything so far is saved. Press Resume to carry on.',
  user: 'Paused by you.',
};

/** After this many detail pages in a row that don't read, the portal has probably changed, so the run stops. */
const MAX_BAD_IN_A_ROW = 5;

export class TabGone extends Error {}
export class NetworkError extends Error {}

/**
 * @param {{ store: any, transport: any, sleep: (ms: number) => Promise<void>, now?: () => number, pacing: any, random?: () => number, onChange?: (run: any) => void, onEnd?: (run: any) => void }} deps
 */
export function createEngine({ store, transport, sleep, now = Date.now, pacing, random = Math.random, onChange = () => {}, onEnd = () => {} }) {
  /** Runs with a loop going in this worker. @type {Set<string>} */
  const looping = new Set();
  /** Pause or Stop pressed while a step is under way, kept here so that step's own save can't lose it. @type {Map<string, 'pause' | 'stop'>} */
  const asked = new Map();

  const save = async (run) => {
    await store.saveRun(run);
    onChange(run);
  };

  async function pause(run, kind, detail) {
    run.status = 'paused';
    run.pauseKind = kind;
    run.reason = detail ?? PAUSE_TEXT[kind];
    run.interruptions.push({ at: now(), kind });
    await save(run);
    onEnd(run);
  }

  async function finish(run) {
    asked.delete(run.id);
    run.status = run.stopRequested ? 'stopped' : 'finished';
    run.phase = 'done';
    run.finishedAt = now();
    run.reason = null;
    run.stats.rows = await store.countRows(run.id);
    await save(run);
    onEnd(run);
  }

  /** Decides what a failed answer means. True when the step should stop here. */
  async function handleBad(run, result) {
    if (result.outcome === 'LOGIN_WALL') return (await pause(run, 'login'), true);
    if (result.outcome === 'ACCOUNT_PROMPT') return (await pause(run, 'account'), true);
    if (result.outcome === 'RATE_LIMITED') return (await pause(run, 'block'), true);
    if (result.outcome === 'SERVER_ERROR' || result.outcome === 'TIMEOUT') return (await retryLater(run, result.reason), true);
    return false;
  }

  /** L1: waits and tries again, longer each time; then pauses. Never for a block. */
  async function retryLater(run, reason) {
    const wait = pacing.backoffSeconds[run.attempts];
    if (wait === undefined) {
      run.attempts = 0;
      await pause(run, 'network', `${PAUSE_TEXT.network}${reason ? ` (${reason})` : ''}`);
      return;
    }
    run.attempts += 1;
    run.retrying = true;
    run.reason = `The portal didn't answer${reason ? ` (${reason})` : ''}. Trying again in ${wait} seconds (attempt ${run.attempts} of ${pacing.backoffSeconds.length}).`;
    await save(run);
    await sleep(wait * 1000 * (1 + random() * 0.2));
  }

  /** The fields of the search under way: one office of several (D66), or the page's own. */
  const searchFields = (run) => (run.searches ? { ...run.fields, ...run.searches[run.searchIndex].fields } : run.fields);

  /** One search is done: the next office, or the detail pages. */
  function nextSearch(run, distinct, expected) {
    run.expectedDone = (run.expectedDone ?? 0) + expected;
    if (run.searches && run.searchIndex < run.searches.length - 1) {
      run.searchIndex += 1;
      run.searchStart = distinct;
      run.page = 1;
      run.sweep = 1;
      run.size = run.baseSize ?? run.size;
      run.totalPages = 1;
      run.note = null;
      return;
    }
    run.expected = run.expectedDone;
    run.note = null;
    run.phase = run.clusters.length ? 'detail' : 'done';
    run.stats.detailTotal = run.clusters.length ? distinct : 0;
  }

  /** Sets up the second sweep, or moves on. */
  async function endOfSweep(run, lastPageRows) {
    const distinct = await store.countRows(run.id);
    run.stats.rows = distinct;
    const expected = (run.totalPages - 1) * run.size + lastPageRows;
    if (run.sweep === 1) run.searchExpected = expected;
    if (run.sweep === 1 && !run.searches) run.expected = expected;
    const found = distinct - (run.searchStart ?? 0);
    // Tied timestamps can hide a row from one sweep (insight 1); another size shifts the page edges and finds it (insight 3).
    if (run.sweep === 1 && found < expected && run.repeatSize && run.repeatSize !== run.size) {
      run.sweep = 2;
      run.size = run.repeatSize;
      run.page = 1;
      run.note = `${(expected - found).toLocaleString('en-US')} rows were hidden by the portal's sorting. Searching the list once more to find them.`;
      return;
    }
    nextSearch(run, distinct, run.searchExpected ?? expected);
  }

  async function listStep(run) {
    const result = await transport.list(run, run.page, run.size, searchFields(run));
    if (result.outcome !== 'OK' && result.outcome !== 'EMPTY') {
      if (await handleBad(run, result)) return;
      await pause(run, 'shape', `${PAUSE_TEXT.shape} ${result.reason ?? ''}`.trim());
      return;
    }
    if (result.empty) {
      if (run.page === 1 && run.sweep === 1) {
        run.totalPages = 0;
        run.searchExpected = 0;
        if (!run.searches) {
          run.expected = 0;
          run.phase = 'done';
        } else {
          nextSearch(run, await store.countRows(run.id), 0);
          if (run.phase === 'detail' && run.stats.detailTotal === 0) run.phase = 'done';
        }
      } else {
        // Rows moved during a long run, so this page no longer exists: the page before was the last full one.
        run.totalPages = run.page - 1;
        await endOfSweep(run, run.size);
      }
      return;
    }
    await store.addRows(run.id, result.rows.map((r) => ({ key: r.key, list: r.values, open: r.open, pending: run.clusters.length ? 1 : 0 })));
    // Read from each answer: new uploads can add a page during a long run (insight 5).
    run.totalPages = result.totalPages ?? run.totalPages;
    run.stats.rows = await store.countRows(run.id);
    if (run.page >= run.totalPages) await endOfSweep(run, result.rows.length);
    else run.page += 1;
  }

  async function detailStep(run) {
    const row = await store.nextPending(run.id);
    if (!row) {
      run.phase = 'done';
      return;
    }
    const result = await transport.detail(run, row);
    if (await handleBad(run, result)) return;
    if (result.outcome === 'OK') {
      await store.saveDetail(run.id, row.key, { detail: result.values, outcome: 'ok', lots: result.lots });
      run.stats.detailDone += 1;
      run.badInARow = 0;
      if (result.lots > 1) run.stats.multiLot += 1;
      for (const label of result.unknown ?? []) if (!run.unknownLabels.includes(label)) run.unknownLabels.push(label);
      return;
    }
    if (result.outcome === 'REFUSED') {
      await store.saveDetail(run.id, row.key, { detail: null, outcome: 'refused' });
      run.stats.refused += 1;
      run.badInARow = 0;
      return;
    }
    await store.saveDetail(run.id, row.key, { detail: null, outcome: 'failed', reason: result.reason });
    run.stats.detailFailed += 1;
    run.badInARow += 1;
    if (run.badInARow >= MAX_BAD_IN_A_ROW) await pause(run, 'shape', `${PAUSE_TEXT.shape} ${result.reason ?? ''}`.trim());
  }

  async function reportStep(run) {
    const office = run.offices[run.officeIndex];
    if (!office) {
      run.phase = 'done';
      return;
    }
    const result = await transport.report(run, office);
    if (result.outcome !== 'OK' && result.outcome !== 'EMPTY') {
      if (await handleBad(run, result)) return;
      await pause(run, 'shape', `${PAUSE_TEXT.shape} ${result.reason ?? ''}`.trim());
      return;
    }
    if (result.outcome === 'EMPTY') run.stats.emptyReports = (run.stats.emptyReports ?? 0) + 1;
    const labels = office.labels ?? { pe_office: office.text };
    await store.addRows(run.id, result.rows.map((r) => ({
      key: `${office.key ?? office.value}|${r.key}`,
      list: { ...labels, office: labels.pe_office, budget_type: r.budget, row_type: r.kind, label: r.label, method: r.method, nature: r.nature, ...r.values },
      pending: 0,
    })));
    run.officeIndex += 1;
    run.stats.rows = await store.countRows(run.id);
  }

  /** The session is checked by a request: a page can show Logout after the session has ended (insight 64). */
  async function sessionGone(run) {
    // Not on Flow 1: every report answer already shows a login wall. Not before the first request: it has only just been seen.
    if (!run.loggedIn || run.offices || run.requests === 0 || run.requests % pacing.sessionCheckEvery !== 0 || run.sessionCheckedAt === run.requests) return false;
    const { loggedIn } = await transport.session(run);
    run.sessionCheckedAt = run.requests;
    if (loggedIn) return false;
    await pause(run, 'login');
    return true;
  }

  async function loop(id) {
    if (looping.has(id)) return;
    looping.add(id);
    try {
      for (;;) {
        const run = await store.getRun(id);
        if (!run || run.status !== 'running') return;
        if (run.stopRequested || run.phase === 'done') {
          await finish(run);
          return;
        }
        const started = now();
        try {
          if (await sessionGone(run)) return;
          run.retrying = false;
          if (run.phase === 'list') await listStep(run);
          else if (run.phase === 'detail') await detailStep(run);
          else await reportStep(run);
          run.requests += 1;
          if (run.status === 'running' && !run.retrying) {
            run.attempts = 0;
            run.reason = null;
          }
        } catch (err) {
          if (err instanceof TabGone) {
            await pause(run, 'tab');
            return;
          }
          if (!(err instanceof NetworkError)) throw err;
          await retryLater(run, err.message);
        }
        run.activeMs += now() - started;
        const request = asked.get(id);
        if (request === 'stop') run.stopRequested = true;
        if (request === 'pause' && run.status === 'running') {
          asked.delete(id);
          await pause(run, 'user');
          return;
        }
        // A pause or Stop pressed in another worker wins too: re-read before saving this step's progress.
        const latest = await store.getRun(id);
        if (latest && latest.status === 'running') {
          run.stopRequested = latest.stopRequested || asked.get(id) === 'stop';
          if (run.status === 'running') await save(run);
          else return;
        } else {
          // Keep this step's progress, with the state the user set.
          if (latest && run.status === 'running') {
            run.status = latest.status;
            run.pauseKind = latest.pauseKind;
            run.reason = latest.reason;
            run.interruptions = latest.interruptions;
            await save(run);
          }
          return;
        }
        if (run.phase !== 'done' && !run.stopRequested) {
          const waited = now();
          await sleep(pacing.paceMs + random() * pacing.jitterMs);
          const after = await store.getRun(id);
          if (after && !asked.has(id)) {
            after.activeMs += now() - waited;
            await store.saveRun(after);
          }
        }
      }
    } catch (err) {
      const run = await store.getRun(id);
      if (run) await pause(run, 'shape', `Something went wrong in the tool: ${err?.message ?? err}. Everything so far is saved.`);
    } finally {
      looping.delete(id);
    }
  }

  return {
    /** Starts a new run from a measured plan. @returns {Promise<any>} */
    async start(plan) {
      const run = {
        id: `${now()}-${Math.floor(random() * 1e6)}`,
        tabId: plan.tabId,
        flowId: plan.flowId,
        status: 'running',
        pauseKind: null,
        reason: null,
        note: null,
        phase: plan.offices ? 'report' : 'list',
        fields: plan.fields,
        shown: plan.shown,
        loggedIn: plan.loggedIn,
        clusters: plan.clusters ?? [],
        chosen: plan.chosen ?? null,
        scope: plan.scope ?? 'all',
        tables: plan.tables ?? null,
        rowsMode: plan.rowsMode ?? 'all',
        project: plan.project ?? null,
        sizes: plan.sizes ?? null,
        size: plan.size,
        baseSize: plan.size,
        repeatSize: plan.repeatSize,
        searches: plan.searches ?? null,
        searchIndex: 0,
        searchStart: 0,
        expectedDone: 0,
        page: 1,
        totalPages: plan.totalPages ?? 1,
        expected: plan.rows ?? null,
        sweep: 1,
        offices: plan.offices ?? null,
        loop: plan.loop ?? null,
        officeIndex: 0,
        requests: 0,
        attempts: 0,
        badInARow: 0,
        sessionCheckedAt: null,
        startedAt: now(),
        finishedAt: null,
        activeMs: 0,
        unknownLabels: [],
        interruptions: [],
        stopRequested: false,
        dismissed: false,
        stats: { rows: 0, detailTotal: 0, detailDone: 0, detailFailed: 0, refused: 0, multiLot: 0 },
      };
      await store.saveRun(run);
      onChange(run);
      loop(run.id);
      return run;
    },
    async pause(id) {
      const run = await store.getRun(id);
      if (run?.status !== 'running') return run;
      if (looping.has(id)) {
        // The loop pauses as soon as its step is saved.
        asked.set(id, 'pause');
        return { ...run, status: 'paused', pauseKind: 'user', reason: 'Paused by you.' };
      }
      await pause(run, 'user');
      return run;
    },
    /** @param {string} id @param {number} [tabId] the tab to carry on through, if the old one has gone */
    async resume(id, tabId) {
      const run = await store.getRun(id);
      if (!run || run.status !== 'paused') return run;
      asked.delete(id);
      if (tabId) run.tabId = tabId;
      run.status = 'running';
      run.pauseKind = null;
      run.reason = null;
      run.attempts = 0;
      run.badInARow = 0;
      run.sessionCheckedAt = null;
      await save(run);
      loop(id);
      return run;
    },
    /** Stop keeps what's collected, and marks it partial (M10-T06). */
    async stop(id) {
      const run = await store.getRun(id);
      if (!run) return null;
      run.stopRequested = true;
      if (looping.has(id)) {
        // The loop finishes as soon as its step is saved.
        asked.set(id, 'stop');
        return run;
      }
      if (run.status === 'paused') {
        run.status = 'running';
        await store.saveRun(run);
        loop(id);
      } else {
        await save(run);
      }
      return run;
    },
    /** Carries on a run this worker lost track of, after it went to sleep. */
    ensure(id) {
      return loop(id);
    },
    /** Marks a run left "running" when the browser itself was closed. */
    async markInterrupted(run) {
      await pause(run, 'chrome');
    },
    isLooping: (id) => looping.has(id),
  };
}
