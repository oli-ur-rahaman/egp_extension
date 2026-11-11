// @ts-nocheck: run records are free-form JSON. Behaviour is covered by tests/unit/engine.test.js.
// M5: the run. One request at a time, each result saved before the next is asked for, so a run survives a closed tab, a closed browser
// or a lost network with nothing lost. It never touches a tab's focus (D47). Portal knowledge comes through `transport`.

/** Why a run stopped by itself, in plain words. */
const PAUSE_TEXT = {
  login: 'The session has ended. Log in to e-GP in this tab, then press Resume.',
  account: 'The portal is asking for account details. Press Update Later on the page, then press Resume.',
  block: 'The portal answered with a block or CAPTCHA. The run stopped at once and will not retry by itself. Everything so far is saved. Try again later.',
  network: "The portal isn't answering. Everything so far is saved. The run carries on by itself within a minute of the network returning, or press Resume.",
  shape: "The portal's page has changed, so reading it could give wrong data. The run stopped. Everything so far is saved.",
  tab: 'The e-GP tab was closed or left the portal. Everything so far is saved. Open e-GP in a tab, open this panel there, and press Resume.',
  chrome: 'Chrome was closed during the run. Everything so far is saved. Press Resume to carry on.',
  user: 'Paused by you.',
};

/** D27: the pause between sprints. @param {number} sprint @param {number} ms */
const sprintText = (sprint, ms) => {
  const hours = ms / 3600000;
  const minutes = Math.max(1, Math.round(ms / 60000));
  const length = hours >= 1 ? `${Math.round(hours * 10) / 10} hour${hours === 1 ? '' : 's'}` : `${minutes} minute${minutes === 1 ? '' : 's'}`;
  return `Sprint ${sprint} is done: ${length} of collecting. Everything is saved, and the file at the end holds every sprint. Press Resume to start sprint ${sprint + 1} when you're ready.`;
};

/** @param {number[]} xs */
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** After this many detail pages in a row that don't read, the portal has probably changed, so the run stops. */
const MAX_BAD_IN_A_ROW = 5;

/** M12: a run's log keeps its first entries and its latest ones, so a very long run's record stays a sensible size. */
const LOG_MAX = 2000;
const LOG_KEEP_FIRST = 20;

const count = (value) => (value ?? 0).toLocaleString('en-US');
const plural = (value, word) => `${count(value)} ${word}${value === 1 ? '' : 's'}`;
const duration = (ms) => {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 90) return plural(minutes, 'minute');
  return `${Math.round(minutes / 6) / 10} hours`;
};
const secs = (ms) => (ms < 10000 ? (Math.round(ms / 100) / 10).toFixed(1) : String(Math.round(ms / 1000)));

/** Entries written in another worker win; this worker's own since `since` are added after them. */
function mergeLog(mine = [], theirs = [], since = 0) {
  const seen = new Set(theirs.map((e) => `${e.at}|${e.text}`));
  return [...theirs, ...mine.filter((e) => e.at >= since && !seen.has(`${e.at}|${e.text}`))].sort((a, b) => a.at - b.at);
}

export class TabGone extends Error {}
export class NetworkError extends Error {}

/**
 * @param {{ store: any, transport: any, sleep: (ms: number) => Promise<void>, now?: () => number, pacing: any, random?: () => number, onChange?: (run: any) => void, onEnd?: (run: any) => void }} deps
 */
export function createEngine({ store, transport, sleep, now = Date.now, pacing, random = Math.random, onChange = () => {}, onEnd = () => {} }) {
  // D27: a run pauses after this much collecting. Tests set sprintMs.
  const sprintMs = pacing.sprintMs ?? (pacing.sprintHours ? pacing.sprintHours * 3600000 : Infinity);
  /** How long each run's last portal request took, and of which kind: set by `timed`. @type {Map<string, { kind: string, ms: number }>} */
  const lastAnswer = new Map();
  const timed = async (run, kind, call) => {
    const started = now();
    const result = await call();
    lastAnswer.set(run.id, { kind, ms: now() - started });
    return result;
  };

  /**
   * M8-T01: slow down before the portal pushes back. The first answers of each kind (list, detail, report) set the run's
   * normal speed; when the latest answers take `slowAt` times as long, the gap between requests grows to match, up to
   * `maxFactor`, and goes back to normal at `normalAt`. Never faster than the set pace.
   */
  function noteSpeed(run, kind, ms) {
    const rule = pacing.slowDown;
    if (!rule) return;
    run.speed ??= {};
    const s = (run.speed[kind] ??= { first: [], last: [] });
    if (s.first.length < rule.firstAnswers) {
      s.first.push(ms);
      return;
    }
    s.last = [...s.last, ms].slice(-rule.lastAnswers);
    if (s.last.length < rule.lastAnswers) return;
    const normalMs = Math.max(median(s.first), 1);
    const nowMs = median(s.last);
    const ratio = nowMs / normalMs;
    const was = run.slow;
    if (ratio >= rule.slowAt) run.slow = { kind, factor: Math.min(rule.maxFactor, Math.round(ratio * 10) / 10), normalMs, nowMs };
    else if (ratio <= rule.normalAt && run.slow?.kind === kind) run.slow = null;
    else if (run.slow?.kind === kind) run.slow = { ...run.slow, nowMs };
    if (!was && run.slow) note(run, 'warn', `The portal is answering slowly: about ${secs(nowMs)} s a page, against ${secs(normalMs)} s at the start. Waiting ${run.slow.factor} times as long between pages.`);
    if (was && !run.slow) note(run, 'info', `The portal is back to its normal speed (about ${secs(nowMs)} s a page). Normal pace again.`);
  }

  /** M12: one line in the run's own log. Events only, not every page, in the words the panel uses. */
  function note(run, level, text) {
    run.log ??= [];
    run.log.push({ at: now(), level, text });
    if (run.log.length > LOG_MAX) run.log.splice(LOG_KEEP_FIRST, run.log.length - LOG_MAX);
  }

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
    note(run, kind === 'user' || kind === 'sprint' ? 'info' : kind === 'block' || kind === 'shape' ? 'error' : 'warn', `Paused: ${run.reason}`);
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
    const st = run.stats;
    const parts = [plural(st.rows, 'row')];
    if (run.offices) parts.push(`${count(run.officeIndex)} of ${plural(run.offices.length, 'report')} read`);
    if (run.clusters.length) parts.push(`${count(st.detailDone)} detail ${st.detailDone === 1 ? 'page' : 'pages'} read`);
    if (st.detailFailed) parts.push(`${count(st.detailFailed)} couldn't be read`);
    if (st.refused) parts.push(`${count(st.refused)} refused by the portal`);
    note(run, 'info', `${run.status === 'stopped' ? 'Stopped by you' : 'Finished'}: ${parts.join(', ')}. Collecting time: ${duration(run.activeMs)}.`);
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
    // The reason may end in its own full stop: it goes in brackets mid-sentence here.
    const why = reason ? ` (${String(reason).replace(/\.$/, '')})` : '';
    run.reason = `The portal didn't answer${why}. Trying again in ${wait} second${wait === 1 ? '' : 's'} (attempt ${run.attempts} of ${pacing.backoffSeconds.length}).`;
    note(run, 'warn', run.reason);
    await save(run);
    await sleep(wait * 1000 * (1 + random() * 0.2));
  }

  /** The fields of the search under way: one office of several (D66), or the page's own. */
  const searchFields = (run) => (run.searches ? { ...run.fields, ...run.searches[run.searchIndex].fields } : run.fields);

  /** One search is done: the next office, or the detail pages. */
  function nextSearch(run, distinct, expected) {
    run.expectedDone = (run.expectedDone ?? 0) + expected;
    if (run.searches) note(run, 'info', `Office ${count(run.searchIndex + 1)} of ${count(run.searches.length)} searched: ${run.searches[run.searchIndex].labels?.office ?? ''}, ${plural(distinct - (run.searchStart ?? 0), 'row')}.`);
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
    note(run, 'info', `List done: ${plural(distinct, 'row')}.${run.clusters.length && distinct ? ` Reading ${plural(distinct, 'detail page')}.` : ''}`);
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
      note(run, 'warn', run.note);
      return;
    }
    nextSearch(run, distinct, run.searchExpected ?? expected);
  }

  async function listStep(run) {
    const result = await timed(run, 'list', () => transport.list(run, run.page, run.size, searchFields(run)));
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
          note(run, 'info', 'The portal has no records for this search.');
        } else {
          nextSearch(run, await store.countRows(run.id), 0);
          if (run.phase === 'detail' && run.stats.detailTotal === 0) run.phase = 'done';
        }
      } else {
        // Rows moved during a long run, so this page no longer exists: the page before was the last full one.
        run.totalPages = run.page - 1;
        note(run, 'warn', `Page ${count(run.page)} of the list no longer exists: rows moved during the run. The list ends at page ${count(run.totalPages)}.`);
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
    const result = await timed(run, 'detail', () => transport.detail(run, row));
    if (await handleBad(run, result)) return;
    if (result.outcome === 'OK') {
      await store.saveDetail(run.id, row.key, { detail: result.values, outcome: 'ok', lots: result.lots });
      run.stats.detailDone += 1;
      run.badInARow = 0;
      if (result.lots > 1) run.stats.multiLot += 1;
      for (const label of result.unknown ?? []) {
        if (run.unknownLabels.includes(label)) continue;
        run.unknownLabels.push(label);
        note(run, 'warn', `A field the tool doesn't know, on the detail page of ${row.key}: "${label}". Not collected.`);
      }
      return;
    }
    if (result.outcome === 'REFUSED') {
      await store.saveDetail(run.id, row.key, { detail: null, outcome: 'refused' });
      note(run, 'info', `The portal refused the detail page of ${row.key}.`);
      run.stats.refused += 1;
      run.badInARow = 0;
      return;
    }
    await store.saveDetail(run.id, row.key, { detail: null, outcome: 'failed', reason: result.reason });
    note(run, 'warn', `Couldn't read the detail page of ${row.key}${result.reason ? `: ${result.reason}` : '.'}`);
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
    const result = await timed(run, 'report', () => transport.report(run, office));
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
        if (run.activeMs - (run.sprintFromMs ?? 0) >= sprintMs) {
          await pause(run, 'sprint', sprintText(run.sprint ?? 1, sprintMs));
          return;
        }
        const started = now();
        lastAnswer.delete(id);
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
            const answer = lastAnswer.get(id);
            if (answer) noteSpeed(run, answer.kind, answer.ms);
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
            run.log = mergeLog(run.log, latest.log, started);
            await save(run);
          }
          return;
        }
        if (run.phase !== 'done' && !run.stopRequested) {
          const waited = now();
          await sleep((pacing.paceMs + random() * pacing.jitterMs) * (run.slow?.factor ?? 1));
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
        sprint: 1,
        sprintFromMs: 0,
        speed: {},
        slow: null,
        stats: { rows: 0, detailTotal: 0, detailDone: 0, detailFailed: 0, refused: 0, multiLot: 0 },
        log: [],
      };
      const login = plan.loggedIn === true ? ' Logged in.' : plan.loggedIn === false ? ' Logged out.' : '';
      note(run, 'info', plan.offices
        ? `Started: ${plural(plan.offices.length, 'report')} to read.${login}`
        : `Started: ${plural(plan.rows ?? 0, 'row')} on ${plural(plan.totalPages ?? 1, 'list page')}${plan.searches ? `, ${count(plan.searches.length)} offices searched one at a time` : ''}; ${run.clusters.length ? 'with detail pages' : 'list only'}.${login}`);
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
    /**
     * @param {string} id @param {number} [tabId] the tab to carry on through, if the old one has gone
     * @param {'you' | 'network'} [by] who resumed it, for the log
     */
    async resume(id, tabId, by = 'you') {
      const run = await store.getRun(id);
      if (!run || run.status !== 'paused') return run;
      asked.delete(id);
      if (tabId) run.tabId = tabId;
      if (run.pauseKind === 'sprint') {
        run.sprint = (run.sprint ?? 1) + 1;
        run.sprintFromMs = run.activeMs;
      }
      note(run, 'info', `${by === 'network' ? 'Resumed by itself: the portal answers again' : 'Resumed by you'}.${run.pauseKind === 'sprint' ? ` Sprint ${count(run.sprint)}.` : ''}`);
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
