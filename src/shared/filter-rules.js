// What must be true before a run may start (D13, D15, D19-D22). Pure: decisions come from the Site Profile, values from the panel.

/**
 * The value a filter holds:
 * select, text, date, tabs: string · tree: { id, name } or { names: string[] } · dateRange: { from, to, fromToday, toToday } ·
 * operatorValue: { operator, value, value2 } · matchText: { mode, text }.
 * @typedef {any} FilterValue
 */

/** @param {string} text dd/mm/yyyy @returns {Date | null} */
export function parseDate(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((text ?? '').trim());
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? d : null;
}

/** @param {Date} d @returns {string} dd/mm/yyyy, in the date's own day */
export function formatDate(d) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** Today's date as a plain date, from the PC's clock. @param {Date} now */
export const todayOf = (now) => new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

/** A date window's two ends, with "current date" ticks resolved to today. @param {FilterValue} value @param {Date} today */
export function resolveWindow(value, today) {
  const end = (/** @type {boolean} */ isToday, /** @type {string} */ text) => (isToday ? today : parseDate(text));
  return { from: end(value?.fromToday, value?.from), to: end(value?.toToday, value?.to) };
}

/** Whole years and months between two dates. @param {Date} from @param {Date} to */
export function spanBetween(from, to) {
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
  if (to.getUTCDate() < from.getUTCDate()) months--;
  return { years: Math.floor(months / 12), months: months % 12 };
}

/** @param {{ years: number, months: number }} span */
export const spanText = (span) => `${span.years} y ${span.months} m`;

/** @param {Date} from @param {Date} to @param {number} maxYears */
function withinYears(from, to, maxYears) {
  const limit = new Date(Date.UTC(from.getUTCFullYear() + maxYears, from.getUTCMonth(), from.getUTCDate()));
  return to <= limit;
}

/**
 * True when the user has given this filter a value. "All" is no value.
 * @param {any} filter
 * @param {FilterValue} value
 */
export function isSet(filter, value) {
  if (value === undefined || value === null) return false;
  switch (filter.control) {
    case 'dateRange': return Boolean(value.fromToday || value.toToday || value.from?.trim() || value.to?.trim());
    case 'operatorValue': return Boolean(value.value?.trim());
    case 'matchText': return Boolean(value.text?.trim());
    case 'tree': return Boolean(value.id || value.names?.length);
    default: return typeof value === 'string' && value.trim() !== '' && value.trim() !== (filter.empty ?? '').trim();
  }
}

/**
 * Says whether a run may start, and if not, why. Time and size come later (D27); these rules never depend on them.
 * A contractor exemption holds here; its 5,000-row limit is checked against the real count at Start (D22).
 * @param {any} flow
 * @param {Record<string, FilterValue>} values
 * @param {{ loggedIn: boolean, today: Date }} context
 * @returns {{ ok: boolean, reasons: string[], exemptionUsed: boolean, maxRows: number | null, window: { from: Date, to: Date, span: string } | null }}
 */
export function evaluateStart(flow, values, { loggedIn, today }) {
  /** @type {string[]} */
  const reasons = [];
  const byId = Object.fromEntries(flow.filters.map((/** @type {any} */ f) => [f.id, f]));
  const given = (/** @type {string} */ id) => isSet(byId[id], values[id]);
  if (flow.login.policy === 'required' && !loggedIn) reasons.push(`${flow.name} needs a login. Log in, then open this page again.`);

  const name = (/** @type {string} */ id) => byId[id].label.replace(/^(Select|By) /, '');
  // An exemption is used when its filter is given, unless the filter it stands in for is given too (D22, D58).
  const used = (flow.rules.exemptions ?? []).filter((/** @type {any} */ e) => e.anyOf.some(given) && !(e.unless ?? []).some(given));
  const lifted = new Set(used.flatMap((/** @type {any} */ e) => e.lifts));
  for (const id of flow.rules.required) {
    if (!lifted.has(id) && !given(id)) reasons.push(`Choose ${name(id)}.`);
  }
  // D58: each group needs at least one of its filters.
  const groups = flow.rules.groups ?? [];
  for (const group of groups) {
    if (lifted.has(group.id) || group.anyOf.some(given)) continue;
    const names = group.anyOf.map(name);
    reasons.push(names.length === 1 ? `Choose ${names[0]}.` : `Choose one of: ${names.slice(0, -1).join(', ')} or ${names.at(-1)}.`);
  }
  /** A date range that can meet a group's need must be whole and within the limit. @param {string} id */
  const isSpan = (id) => flow.rules.window?.filter === id || groups.some((/** @type {any} */ g) => g.anyOf.includes(id));
  const spanLifted = (/** @type {string} */ id) => lifted.has(id) || groups.some((/** @type {any} */ g) => g.anyOf.includes(id) && lifted.has(g.id));

  // Every date range is checked for sense; only the mandatory one has a span limit.
  /** @type {{ from: Date, to: Date, span: string } | null} */
  let window = null;
  for (const filter of flow.filters.filter((/** @type {any} */ f) => f.control === 'dateRange')) {
    if (!given(filter.id)) continue;
    const value = values[filter.id];
    const { from, to } = resolveWindow(value, today);
    const isWindow = isSpan(filter.id);
    if (!value.fromToday && value.from?.trim() && !from) reasons.push(`${filter.label} From isn't a real date. Use dd/mm/yyyy.`);
    if (!value.toToday && value.to?.trim() && !to) reasons.push(`${filter.label} To isn't a real date. Use dd/mm/yyyy.`);
    if (isWindow && !spanLifted(filter.id) && (!from || !to)) {
      if (!from && !value.from?.trim()) reasons.push(`Enter ${filter.label} From.`);
      if (!to && !value.to?.trim()) reasons.push(`Enter ${filter.label} To.`);
    }
    if (from && to && from > to) reasons.push(`${filter.label}: From must not be after To.`);
    if (isWindow && from && to && from <= to) {
      const span = { from, to, span: spanText(spanBetween(from, to)) };
      if (flow.rules.window?.filter === filter.id) window = span;
      const max = flow.rules.window?.maxYears ?? 5;
      if (!spanLifted(filter.id) && !withinYears(from, to, max)) reasons.push(`${filter.label} spans ${span.span}. The limit is ${max} years.`);
    }
  }
  const estimated = flow.filters.find((/** @type {any} */ f) => f.control === 'operatorValue');
  if (estimated && values[estimated.id]?.operator === 'Between') {
    const { value, value2 } = values[estimated.id];
    if (!(Number(value2) > Number(value))) reasons.push(`${estimated.label}: Between needs two values, the second larger.`);
  }
  const maxRows = used.length ? Math.min(...used.map((/** @type {any} */ e) => e.maxRows)) : null;
  return { ok: reasons.length === 0, reasons, exemptionUsed: used.length > 0, maxRows, window };
}
