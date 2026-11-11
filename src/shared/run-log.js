// M12: a run's activity log as files the user can keep: plain text to read, JSON for tools. Holds only what the engine
// wrote (events in plain words) and the filters as the panel showed them: never a password, cookie or token (M12-AT2).

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');
/** @param {number} at */
export const clock = (at) => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
/** @param {number} at */
const day = (at) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** @type {Record<string, string>} */
const LEVEL = { info: '', warn: 'Warning: ', error: 'Problem: ' };

/**
 * @param {any} run
 * @param {{ flowName?: string, toolVersion?: string }} [about]
 */
export function logText(run, about = {}) {
  const log = run.log ?? [];
  const lines = [
    'PDMS activity log',
    `Report: ${about.flowName ?? run.flowId}`,
    `Started: ${day(run.startedAt)} ${clock(run.startedAt)} (this PC's time)`,
    `PDMS version: ${about.toolVersion ?? '-'}`,
  ];
  const filters = (run.shown ?? []).filter((/** @type {any} */ f) => f.value !== '-');
  if (filters.length) lines.push('Filters:', ...filters.map((/** @type {any} */ f) => `  ${f.label}: ${f.value}`));
  lines.push('');
  let lastDay = day(run.startedAt);
  for (const entry of log) {
    // A run over midnight says so, so the times read right.
    if (day(entry.at) !== lastDay) {
      lastDay = day(entry.at);
      lines.push(`-- ${lastDay} --`);
    }
    lines.push(`${clock(entry.at)}  ${LEVEL[entry.level] ?? ''}${entry.text}`);
  }
  if (!log.length) lines.push('Nothing was logged for this run: it was started before PDMS kept a log (version 0.11.0).');
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * @param {any} run
 * @param {{ flowName?: string, toolVersion?: string }} [about]
 */
export function logJson(run, about = {}) {
  return JSON.stringify({
    tool: 'PDMS',
    toolVersion: about.toolVersion ?? null,
    flowId: run.flowId,
    flowName: about.flowName ?? null,
    runId: run.id,
    startedAt: new Date(run.startedAt).toISOString(),
    finishedAt: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
    status: run.status,
    filters: run.shown ?? [],
    stats: run.stats,
    log: (run.log ?? []).map((/** @type {any} */ e) => ({ at: new Date(e.at).toISOString(), level: e.level, text: e.text })),
  }, null, 2);
}

/** `PDMS_log_<date>_<time>.<ext>`, beside the data file's `PDMS_<date>_<time>.xls` (D73). @param {string} ext @param {Date} [now] */
export function logFileName(ext, now = new Date()) {
  return `PDMS_log_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.${ext}`;
}
