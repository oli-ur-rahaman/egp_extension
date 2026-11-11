// M5, M8: the run engine against a scripted portal. Fake portal pages are in the e2e tests; these drive the faults exactly.
import { describe, expect, it } from 'vitest';
import { createEngine, NetworkError, TabGone } from '../../src/background/engine.js';
import { estimate, progressOf, roundTime, timeLeft } from '../../src/shared/estimate.js';
import { readFileSync } from 'node:fs';

const profile = JSON.parse(readFileSync(new URL('../../profiles/eprocure.gov.bd.json', import.meta.url), 'utf8'));

function memoryStore() {
  const runs = new Map();
  const rows = new Map();
  const of = (runId) => [...rows.values()].filter((r) => r.runId === runId).sort((a, b) => a.seq - b.seq);
  return {
    getRun: async (id) => structuredClone(runs.get(id)),
    saveRun: async (run) => { runs.set(run.id, structuredClone(run)); },
    allRuns: async () => [...runs.values()].map((r) => structuredClone(r)),
    countRows: async (id) => of(id).length,
    addRows: async (id, list) => {
      let seq = of(id).length;
      for (const r of list) if (!rows.has(`${id}|${r.key}`)) rows.set(`${id}|${r.key}`, { ...r, runId: id, seq: seq++ });
    },
    nextPending: async (id) => of(id).find((r) => r.pending === 1),
    saveDetail: async (id, key, change) => { rows.set(`${id}|${key}`, { ...rows.get(`${id}|${key}`), ...change, pending: 0 }); },
    allRows: async (id) => of(id),
  };
}

const pacing = { paceMs: 0, jitterMs: 0, backoffSeconds: [0, 0, 0], sessionCheckEvery: 3, listSeconds: 1, detailSeconds: 1 };
const row = (i) => ({ key: `r${i}`, values: { id: `r${i}` }, open: { id: `r${i}` } });

/** A portal with `total` rows. `faults` can fail any call by its number. */
function portal(total, { size = 100, faults = {}, onCall = () => {} } = {}) {
  const calls = { list: 0, detail: 0, report: 0, session: 0 };
  const all = Array.from({ length: total }, (_, i) => row(i));
  const fault = (name) => {
    const f = faults[`${name}${calls[name]}`];
    if (f === 'network') throw new NetworkError('down');
    if (f === 'tab') throw new TabGone();
    return f;
  };
  return {
    calls,
    list: async (_run, page, pageSize = size) => {
      calls.list++;
      onCall('list');
      const f = fault('list');
      if (f) return f;
      const slice = all.slice((page - 1) * pageSize, page * pageSize);
      if (!slice.length) return { outcome: 'EMPTY', empty: true, rows: [] };
      return { outcome: 'OK', rows: slice, totalPages: Math.ceil(total / pageSize), empty: false };
    },
    detail: async (_run, r) => {
      calls.detail++;
      onCall('detail');
      const f = fault('detail');
      if (f) return f;
      return { outcome: 'OK', values: { got: r.key }, unknown: [], lots: 1 };
    },
    report: async () => { calls.report++; return fault('report') ?? { outcome: 'OK', rows: [{ key: '1', kind: 'Method', budget: 'Development', method: 'OTM', nature: 'Goods', values: {} }] }; },
    session: async () => { calls.session++; return fault('session') ?? { loggedIn: true }; },
  };
}

function setup(transport, store = memoryStore()) {
  const ended = [];
  const engine = createEngine({ store, transport, pacing, sleep: async () => {}, random: () => 0, onEnd: (r) => ended.push(structuredClone(r)) });
  return { engine, store, ended };
}

/** Waits for the run to stop moving. */
async function settled(store, id) {
  for (let i = 0; i < 2000; i++) {
    const run = await store.getRun(id);
    if (run.status !== 'running') return run;
    await new Promise((r) => setTimeout(r, 1));
  }
  throw new Error('run did not settle');
}

const plan = (extra = {}) => ({ tabId: 1, flowId: 'tender_info', fields: {}, shown: [], loggedIn: false, size: 100, repeatSize: 50, totalPages: 1, rows: 0, clusters: [], ...extra });

describe('a run', () => {
  it('collects every list page, then every detail page', async () => {
    const t = portal(250);
    const { engine, store } = setup(t);
    const run = await engine.start(plan({ clusters: ['identity'] }));
    const done = await settled(store, run.id);
    expect(done.status).toBe('finished');
    expect(done.stats.rows).toBe(250);
    expect(t.calls.list).toBe(3);
    expect(t.calls.detail).toBe(250);
    expect((await store.allRows(run.id)).every((r) => r.detail?.got === r.key)).toBe(true);
  });

  it('with nothing ticked, opens no detail pages', async () => {
    const t = portal(120);
    const { engine, store } = setup(t);
    const run = await engine.start(plan());
    const done = await settled(store, run.id);
    expect(done.status).toBe('finished');
    expect(t.calls.detail).toBe(0);
  });

  it('an empty search finishes with no rows', async () => {
    const { engine, store } = setup(portal(0));
    const run = await engine.start(plan());
    const done = await settled(store, run.id);
    expect(done.status).toBe('finished');
    expect(done.stats.rows).toBe(0);
    expect(done.expected).toBe(0);
  });

  it('a row lost to the portal\'s sorting is found by a second search at another size', async () => {
    const t = portal(200);
    const realList = t.list;
    t.list = async (run, page, size) => {
      const got = await realList(run, page, size);
      // At size 100, one row of page 1 is seen twice and its neighbour never (E8).
      if (size === 100 && page === 1) got.rows = [got.rows[0], got.rows[0], ...got.rows.slice(2)];
      return got;
    };
    const { engine, store } = setup(t);
    const run = await engine.start(plan());
    const done = await settled(store, run.id);
    expect(done.sweep).toBe(2);
    expect(done.stats.rows).toBe(200);
    expect(done.expected).toBe(200);
  });

  it('a shortfall that a second search can\'t fix is left for the file to report, never hidden', async () => {
    const t = portal(200);
    const realList = t.list;
    t.list = async (run, page, size) => {
      const got = await realList(run, page, size);
      got.rows = got.rows.filter((r) => r.key !== 'r50');
      return got;
    };
    const { engine, store } = setup(t);
    const run = await engine.start(plan());
    const done = await settled(store, run.id);
    expect(done.status).toBe('finished');
    expect(done.sweep).toBe(2);
    expect(done.stats.rows).toBe(199);
  });

  it('a refused record is noted on its row, and the run carries on', async () => {
    const { engine, store } = setup(portal(3, { faults: { detail2: { outcome: 'REFUSED' } } }));
    const run = await engine.start(plan({ clusters: ['identity'] }));
    const done = await settled(store, run.id);
    expect(done.status).toBe('finished');
    expect(done.stats.refused).toBe(1);
    expect(done.stats.detailDone).toBe(2);
    expect((await store.allRows(run.id))[1].outcome).toBe('refused');
  });
});

describe('when things go wrong', () => {
  it('a block stops at once, with no retry', async () => {
    const t = portal(5, { faults: { detail2: { outcome: 'RATE_LIMITED', reason: 'block' } } });
    const { engine, store, ended } = setup(t);
    const run = await engine.start(plan({ clusters: ['identity'] }));
    const done = await settled(store, run.id);
    expect(done.status).toBe('paused');
    expect(done.pauseKind).toBe('block');
    expect(t.calls.detail).toBe(2);
    expect(ended).toHaveLength(1);
  });

  it('a lost session pauses, and resuming after login loses and repeats nothing', async () => {
    const t = portal(5, { faults: { detail3: { outcome: 'LOGIN_WALL' } } });
    const { engine, store } = setup(t);
    const run = await engine.start(plan({ clusters: ['identity'] }));
    let got = await settled(store, run.id);
    expect(got.pauseKind).toBe('login');
    await engine.resume(run.id);
    got = await settled(store, run.id);
    expect(got.status).toBe('finished');
    expect(got.stats.detailDone).toBe(5);
    expect(new Set((await store.allRows(run.id)).map((r) => r.key)).size).toBe(5);
  });

  it('a session that ended quietly is found by asking the portal', async () => {
    const t = portal(10, { faults: { session2: { loggedIn: false } } });
    const { engine, store } = setup(t);
    const run = await engine.start(plan({ clusters: ['identity'], loggedIn: true }));
    const got = await settled(store, run.id);
    expect(got.pauseKind).toBe('login');
    expect(t.calls.session).toBe(2);
  });

  it('the network failing a few times is waited out', async () => {
    const t = portal(3, { faults: { detail1: 'network', detail2: 'network' } });
    const { engine, store } = setup(t);
    const run = await engine.start(plan({ clusters: ['identity'] }));
    const got = await settled(store, run.id);
    expect(got.status).toBe('finished');
    expect(got.stats.detailDone).toBe(3);
    expect(got.attempts).toBe(0);
    expect(got.reason).toBeNull();
  });

  it('the network staying down pauses after the last wait; resume carries on with nothing lost', async () => {
    const faults = Object.fromEntries([2, 3, 4, 5].map((i) => [`detail${i}`, 'network']));
    const t = portal(4, { faults });
    const { engine, store } = setup(t);
    const run = await engine.start(plan({ clusters: ['identity'] }));
    let got = await settled(store, run.id);
    expect(got.pauseKind).toBe('network');
    expect(got.stats.detailDone).toBe(1);
    await engine.resume(run.id);
    got = await settled(store, run.id);
    expect(got.status).toBe('finished');
    expect(got.stats.detailDone).toBe(4);
  });

  it('a server error is retried, not treated as a change in the portal', async () => {
    const t = portal(2, { faults: { list1: { outcome: 'SERVER_ERROR', reason: '500' } } });
    const { engine, store } = setup(t);
    const run = await engine.start(plan());
    expect((await settled(store, run.id)).status).toBe('finished');
    expect(t.calls.list).toBe(2);
  });

  it('a changed list page stops the run', async () => {
    const { engine, store } = setup(portal(3, { faults: { list1: { outcome: 'SHAPE_CHANGED', reason: 'columns' } } }));
    const run = await engine.start(plan());
    const got = await settled(store, run.id);
    expect(got.pauseKind).toBe('shape');
    expect(got.reason).toContain('columns');
  });

  it('one unreadable detail page is noted; five in a row stop the run', async () => {
    const bad = { outcome: 'SHAPE_CHANGED', reason: 'title' };
    const t = portal(8, { faults: { detail1: bad, detail3: bad, detail4: bad, detail5: bad, detail6: bad, detail7: bad } });
    const { engine, store } = setup(t);
    const run = await engine.start(plan({ clusters: ['identity'] }));
    const got = await settled(store, run.id);
    expect(got.stats.detailFailed).toBe(6);
    expect(got.pauseKind).toBe('shape');
  });

  it('the tab going away pauses, and the run carries on through another tab', async () => {
    const t = portal(3, { faults: { detail2: 'tab' } });
    const { engine, store } = setup(t);
    const run = await engine.start(plan({ clusters: ['identity'] }));
    let got = await settled(store, run.id);
    expect(got.pauseKind).toBe('tab');
    await engine.resume(run.id, 99);
    got = await settled(store, run.id);
    expect(got.tabId).toBe(99);
    expect(got.status).toBe('finished');
    expect(got.stats.detailDone).toBe(3);
  });

  it('the worker dying at any step loses and repeats nothing (M5-AT1)', async () => {
    for (let killAt = 1; killAt <= 12; killAt++) {
      const store = memoryStore();
      let calls = 0;
      let alive = true;
      const die = () => {
        if (!alive) return;
        calls++;
        if (calls === killAt) {
          alive = false;
          throw new Error('worker killed');
        }
      };
      const first = portal(150, { onCall: die, size: 100 });
      const a = createEngine({ store, transport: first, pacing, sleep: async () => {}, random: () => 0 });
      const run = await a.start(plan({ clusters: ['identity'] }));
      const stopped = await settled(store, run.id);
      if (stopped.status === 'finished') continue;
      // A new worker wakes and carries on.
      const second = portal(150);
      const b = createEngine({ store, transport: second, pacing, sleep: async () => {}, random: () => 0 });
      await b.resume(run.id);
      const got = await settled(store, run.id);
      expect(got.status).toBe('finished');
      const rows = await store.allRows(run.id);
      expect(rows).toHaveLength(150);
      expect(new Set(rows.map((r) => r.key)).size).toBe(150);
      expect(rows.every((r) => r.outcome === 'ok')).toBe(true);
    }
  });

  it('Stop keeps what was collected, and marks it stopped', async () => {
    const store = memoryStore();
    const t = portal(50);
    const engine = createEngine({ store, transport: t, pacing, sleep: () => new Promise((r) => setTimeout(r, 2)), random: () => 0 });
    const run = await engine.start(plan({ clusters: ['identity'] }));
    while (t.calls.detail < 3) await new Promise((r) => setTimeout(r, 1));
    await engine.stop(run.id);
    const got = await settled(store, run.id);
    expect(got.status).toBe('stopped');
    expect(got.stats.rows).toBe(50);
    expect(got.stats.detailDone).toBeLessThan(50);
  });

  it('Pause holds, and Resume carries on', async () => {
    const store = memoryStore();
    const t = portal(30);
    const engine = createEngine({ store, transport: t, pacing, sleep: () => new Promise((r) => setTimeout(r, 2)), random: () => 0 });
    const run = await engine.start(plan({ clusters: ['identity'] }));
    while (t.calls.detail < 2) await new Promise((r) => setTimeout(r, 1));
    await engine.pause(run.id);
    const paused = await settled(store, run.id);
    expect(paused.status).toBe('paused');
    const seen = t.calls.detail;
    await new Promise((r) => setTimeout(r, 20));
    expect(t.calls.detail).toBeLessThanOrEqual(seen + 1);
    await engine.resume(run.id);
    expect((await settled(store, run.id)).stats.detailDone).toBe(30);
  });

  it('Flow 1 never asks a separate page about the session, and nothing asks before the first request', async () => {
    const t = portal(0);
    const { engine, store } = setup(t);
    const offices = Array.from({ length: 7 }, (_, i) => ({ value: String(i), text: `O${i}` }));
    const run = await engine.start(plan({ loggedIn: true, offices, loop: { field: 'offId', mirror: 'offName' }, flowId: 'procurement_transaction_report' }));
    expect((await settled(store, run.id)).status).toBe('finished');
    expect(t.calls.session).toBe(0);
    expect(t.calls.report).toBe(7);
  });

  it('a retry says why', async () => {
    const t = portal(2, { faults: { list1: 'network' } });
    const seen = [];
    const store = memoryStore();
    const engine = createEngine({ store, transport: t, pacing, sleep: async () => { seen.push((await store.allRuns())[0].reason); }, random: () => 0 });
    const run = await engine.start(plan());
    await settled(store, run.id);
    expect(seen.find((r) => r?.startsWith("The portal didn't answer"))).toContain('(down)');
  });

  it('Flow 1 makes one report per office', async () => {
    const t = portal(0);
    const { engine, store } = setup(t);
    const run = await engine.start(plan({ offices: [{ value: '1', text: 'A' }, { value: '2', text: 'B' }], loop: { field: 'offId', mirror: 'offName' }, flowId: 'procurement_transaction_report' }));
    const got = await settled(store, run.id);
    expect(got.status).toBe('finished');
    expect(t.calls.report).toBe(2);
    expect((await store.allRows(run.id)).map((r) => r.list.office)).toEqual(['A', 'B']);
  });
});

describe('sprints (D27) and slowing down (M8-T01)', () => {
  /** An engine on a fake clock: each portal call takes `latency(kind, n)` ms. Records every pause between requests. */
  function timedSetup(total, pace, latency, { size = 10, clusters = [] } = {}) {
    let clock = 0;
    const counts = { list: 0, detail: 0 };
    const transport = portal(total, { size, onCall: (kind) => { clock += latency(kind, counts[kind]++); } });
    const store = memoryStore();
    const waits = [];
    const ended = [];
    const engine = createEngine({ store, transport, pacing: pace, now: () => clock, random: () => 0, sleep: async (ms) => { waits.push(ms); }, onEnd: (r) => ended.push(structuredClone(r)) });
    return { engine, store, waits, ended, plan: plan({ totalPages: Math.ceil(total / size), rows: total, size, repeatSize: size, clusters }) };
  }

  it('pauses after each sprint, says so, and Resume carries on to one complete result', async () => {
    const t = timedSetup(200, { ...pacing, sprintMs: 3000 }, () => 400);
    const run = await t.engine.start(t.plan);
    let got = await settled(t.store, run.id);
    expect(got.status).toBe('paused');
    expect(got.pauseKind).toBe('sprint');
    expect(got.reason).toMatch(/^Sprint 1 is done: 1 minute of collecting\. Everything is saved.*Press Resume to start sprint 2/);
    expect(t.ended.at(-1).pauseKind).toBe('sprint'); // so the user is told (a notification)
    let sprints = 1;
    while (got.status === 'paused' && got.pauseKind === 'sprint') {
      await t.engine.resume(run.id);
      got = await settled(t.store, run.id);
      sprints += 1;
      expect(got.sprint).toBe(sprints);
    }
    expect(got.status).toBe('finished');
    expect(await t.store.countRows(run.id)).toBe(200);
    // 20 list pages of 400 ms each, in sprints of 3 s: 8 pages a sprint, so 3 sprints.
    expect(sprints).toBe(3);
  });

  it('no sprint pause when the profile sets none', async () => {
    const t = timedSetup(200, pacing, () => 400);
    const run = await t.engine.start(t.plan);
    expect((await settled(t.store, run.id)).status).toBe('finished');
  });

  it('waits longer while the portal answers slowly, and goes back to normal pace after', async () => {
    const slowDown = { firstAnswers: 5, lastAnswers: 5, slowAt: 2, normalAt: 1.5, maxFactor: 4 };
    // Detail pages: 10 at 100 ms, then 10 at 500 ms, then the rest at 100 ms.
    const latency = (kind, i) => (kind === 'detail' && i >= 10 && i < 20 ? 500 : 100);
    const t = timedSetup(40, { ...pacing, paceMs: 1000, slowDown }, latency, { size: 40, clusters: ['identity'] });
    const run = await t.engine.start(t.plan);
    const got = await settled(t.store, run.id);
    expect(got.status).toBe('finished');
    expect(got.stats.detailDone).toBe(40);
    // Pauses: 1 after the list page, then one after each detail page but the last.
    const detailWaits = t.waits.slice(1);
    expect(Math.max(...detailWaits)).toBe(4000); // 5 times as slow, held to 4 times the pace
    expect(detailWaits.slice(0, 12).every((w) => w === 1000)).toBe(true); // normal until the slow answers outnumber the rest
    expect(detailWaits.at(-1)).toBe(1000); // and normal again at the end
    expect(got.slow).toBeNull();
  });

  it('says why it is going slower while it does', async () => {
    const slowDown = { firstAnswers: 2, lastAnswers: 2, slowAt: 2, normalAt: 1.5, maxFactor: 4 };
    const t = timedSetup(30, { ...pacing, paceMs: 1000, slowDown }, (kind, i) => (kind === 'detail' && i >= 2 ? 300 : 100), { size: 30, clusters: ['identity'] });
    const run = await t.engine.start(t.plan);
    const got = await settled(t.store, run.id);
    expect(got.slow).toEqual({ kind: 'detail', factor: 3, normalMs: 100, nowMs: 300 });
  });
});

describe('estimate (D27)', () => {
  const p = { paceMs: 3000, jitterMs: 1000, listSeconds: 2, detailSeconds: 0.5 };
  it('is a range, and says when a run is long', () => {
    const small = estimate({ pacing: p, listRequests: 2, detailRequests: 100 });
    expect(small.level).toBe('ok');
    expect(small.text).toMatch(/^About \d+ minutes to \d+ minutes$/);
    expect(estimate({ pacing: p, listRequests: 100, detailRequests: 10000 }).level).toBe('long');
    expect(estimate({ pacing: p, listRequests: 100, detailRequests: 40000 }).level).toBe('unrealistic');
  });
  it('says "1 hour", not "1 hours"', () => {
    expect(roundTime(3600)).toBe('1 hour');
    expect(roundTime(5400)).toBe('1.5 hours');
  });
  it('the profile pacing covers the live one-hour run (self-run log run 17)', () => {
    // Flow 4, 12 list pages and 1,191 detail pages, took 72 minutes live.
    const live = estimate({ pacing: profile.pageStates.pacing, listRequests: 12, detailRequests: 1191 });
    expect(Math.abs(live.low - 72 * 60) / (72 * 60)).toBeLessThan(0.05); // the expected time, within 5%
    expect(live.high).toBeGreaterThanOrEqual(72 * 60);
    expect(live.text).toBe('About 1 hour to 2 hours');
    expect(live.sprints).toBe(1);
    // 10,000 detail pages: about 10 hours, so 2 sprints of 6 hours.
    expect(estimate({ pacing: profile.pageStates.pacing, listRequests: 100, detailRequests: 10000 }).sprints).toBe(2);
  });
  it('progress runs from 0 to 1 and time left comes from measured speed', () => {
    const run = { phase: 'detail', status: 'running', totalPages: 2, sweep: 1, page: 2, expected: 100, clusters: ['a'], requests: 10, activeMs: 40000, offices: null, stats: { rows: 100, detailTotal: 100, detailDone: 49, detailFailed: 0, refused: 0 } };
    expect(progressOf(run)).toBeCloseTo(51 / 102, 3);
    expect(timeLeft(run)).toBe('3 minutes');
    expect(progressOf({ ...run, phase: 'done' })).toBe(1);
  });
});
