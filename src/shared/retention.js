// M12-T05, D76: finished runs are cleared 30 days after they finish, unless the user has pressed New search first.
// A run that is running or paused is never cleared, however old: it may hold work not yet in a file.

export const KEEP_FINISHED_DAYS = 30;
const DAY = 24 * 3600 * 1000;

/**
 * The runs to clear now.
 * @param {any[]} runs
 * @param {number} now
 * @param {number} [days]
 * @returns {any[]}
 */
export function expiredRuns(runs, now, days = KEEP_FINISHED_DAYS) {
  return runs.filter((run) => {
    if (run.status !== 'finished' && run.status !== 'stopped') return false;
    const ended = run.finishedAt ?? run.startedAt;
    return typeof ended === 'number' && now - ended > days * DAY;
  });
}
