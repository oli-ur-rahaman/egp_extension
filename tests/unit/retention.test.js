// M12-T05, D76: which runs are cleared, and which are never.
import { describe, expect, it } from 'vitest';
import { expiredRuns, KEEP_FINISHED_DAYS } from '../../src/shared/retention.js';

const DAY = 24 * 3600 * 1000;
const now = Date.UTC(2026, 10, 12);
const run = (id, status, ageDays, extra = {}) => ({ id, status, startedAt: now - ageDays * DAY - 3600000, finishedAt: status === 'finished' || status === 'stopped' ? now - ageDays * DAY : null, ...extra });

describe('clearing old runs (M12-T05, D76)', () => {
  it('keeps finished runs 30 days', () => {
    expect(KEEP_FINISHED_DAYS).toBe(30);
    const runs = [run('young', 'finished', 29), run('edge', 'finished', 30), run('old', 'finished', 31), run('oldStopped', 'stopped', 45)];
    expect(expiredRuns(runs, now).map((r) => r.id)).toEqual(['old', 'oldStopped']);
  });

  it('never clears a run that is running or paused, however old', () => {
    const runs = [run('paused', 'paused', 400), run('running', 'running', 400)];
    expect(expiredRuns(runs, now)).toEqual([]);
  });

  it('a run saved before it had a finish time counts from its start', () => {
    expect(expiredRuns([run('legacy', 'finished', 60, { finishedAt: undefined })], now).map((r) => r.id)).toEqual(['legacy']);
  });
});
