// D27: how long a run will take, from its real size. Always a range. Never promises; never goes faster to shorten it.

const HOUR = 3600;

/** @param {number} seconds */
export function roundTime(seconds) {
  if (seconds < 90) return 'under 2 minutes';
  if (seconds < HOUR) return `${Math.round(seconds / 60)} minutes`;
  const hours = seconds / HOUR;
  if (hours < 48) return `${hours < 10 ? Math.round(hours * 2) / 2 : Math.round(hours)} hours`;
  return `${Math.round(hours / 24)} days`;
}

/**
 * @param {{ pacing: any, listRequests: number, detailRequests: number }} input
 * @returns {{ low: number, high: number, text: string, listText: string, detailText: string, level: 'ok' | 'long' | 'unrealistic' }}
 */
export function estimate({ pacing, listRequests, detailRequests }) {
  const pace = pacing.paceMs / 1000 + pacing.jitterMs / 2000;
  const listTime = listRequests * (pace + pacing.listSeconds);
  const detailTime = detailRequests * (pace + pacing.detailSeconds);
  const low = listTime + detailTime;
  const high = low * 1.5;
  const lowText = roundTime(low);
  const highText = roundTime(high);
  return {
    low,
    high,
    text: lowText === highText ? `About ${lowText}` : `About ${lowText} to ${highText}`,
    listText: roundTime(listTime),
    detailText: roundTime(detailTime),
    level: low > 24 * HOUR ? 'unrealistic' : low > 6 * HOUR ? 'long' : 'ok',
  };
}

/**
 * Time left in a run, from the speed measured so far.
 * @param {any} run
 * @returns {string | null}
 */
export function timeLeft(run) {
  if (run.requests < 3 || run.status !== 'running') return null;
  const perRequest = run.activeMs / run.requests;
  let left;
  if (run.phase === 'report') left = run.offices.length - run.officeIndex;
  else if (run.phase === 'list') left = Math.max(0, run.totalPages - run.page) + run.clusters.length * (run.expected ?? 0);
  else if (run.phase === 'detail') left = Math.max(0, run.stats.detailTotal - run.stats.detailDone - run.stats.detailFailed - run.stats.refused);
  else return null;
  return roundTime((left * perRequest) / 1000);
}

/** How far along a run is, 0 to 1. @param {any} run */
export function progressOf(run) {
  if (run.phase === 'done' && run.status !== 'stopped') return 1;
  if (run.offices) return run.officeIndex / Math.max(1, run.offices.length);
  const details = run.clusters.length ? run.expected ?? run.stats.rows : 0;
  const listPages = Math.max(1, run.totalPages);
  const done = run.phase === 'list' && run.sweep === 1 ? run.page - 1 : listPages;
  const detailsDone = run.stats.detailDone + run.stats.detailFailed + run.stats.refused;
  return Math.min(1, (done + detailsDone) / Math.max(1, listPages + details));
}
