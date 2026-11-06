// @ts-nocheck: draws from the profile's free-form JSON, so types would all be `any`. Its behaviour is covered by the panel's e2e tests.
// Draws the panel from state. No messaging here, so every screen can be tested on its own.
// Filter controls call `on.change(filterId, value)`; the controller applies it to the real page, then redraws.

import { evaluateStart, formatDate, resolveWindow, spanBetween, spanText, todayOf } from '../shared/filter-rules.js';

/**
 * @param {string} tag
 * @param {Record<string, any>} [props]
 * @param {...(Node | string | null | false | undefined)} children
 * @returns {any}
 */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** @param {string} kind ok, warn, bad or note @param {string} text */
const notice = (kind, text) => {
  const icon = { ok: '✓', warn: '⚠', bad: '✕', note: 'ⓘ' }[kind];
  return h('p', { class: `notice ${kind}` }, `${icon} ${text}`);
};

/** The first entry of a dropdown: All, or a prompt when a choice is required. */
function emptyLabel(flow, filter) {
  const required = flow.rules.required.includes(filter.id);
  return required ? `Choose ${filter.label.replace(/^(Select|By) /, '')}` : 'All';
}

function selectControl(flow, filter, scan, on) {
  const id = `f-${filter.id}`;
  if (filter.allMeansLoop) {
    const drafted = on.draft(filter.id);
    return h('select', { id, onchange: (e) => on.change(filter.id, e.target.value) },
      h('option', { value: '__all__', selected: drafted === '__all__' }, `All offices (${scan.options.length})`),
      ...scan.options.map((o) => h('option', { value: o.value, selected: drafted !== '__all__' && scan.value === o.value }, o.text)));
  }
  const hasAll = !filter.choices;
  const pageHasThisEmpty = scan.options.every((o) => o.value !== scan.value);
  return h('select', { id, onchange: (e) => on.change(filter.id, e.target.value) },
    hasAll && !(filter.default) && h('option', { value: filter.empty ?? '', selected: pageHasThisEmpty }, emptyLabel(flow, filter)),
    ...scan.options.map((o) => h('option', { value: o.value, selected: scan.value === o.value }, o.text)));
}

function tabsControl(filter, scan, on) {
  return h('select', { id: `f-${filter.id}`, onchange: (e) => on.change(filter.id, e.target.value) },
    ...filter.choices.map((c) => h('option', { value: c.value, selected: scan.value === c.value }, c.label)));
}

function textControl(filter, scan, on) {
  return h('input', { id: `f-${filter.id}`, type: 'text', value: scan.value ?? '', onchange: (e) => on.change(filter.id, e.target.value) });
}

function dateControl(filter, scan, on) {
  return h('input', { id: `f-${filter.id}`, type: 'text', placeholder: 'dd/mm/yyyy', value: scan.value ?? '', onchange: (e) => on.change(filter.id, e.target.value) });
}

function dateRangeControl(flow, filter, scan, on) {
  const value = on.value(filter.id);
  const withToday = flow.rules.window?.filter === filter.id && flow.rules.window.currentDateCheckboxes;
  const end = (role, flag) => h('div', { class: 'date-end' },
    h('label', { for: `f-${filter.id}-${role}` }, role === 'from' ? 'From' : 'To'),
    h('input', { id: `f-${filter.id}-${role}`, type: 'text', placeholder: 'dd/mm/yyyy', value: value[role] ?? '', disabled: !!value[flag],
      onchange: (e) => on.change(filter.id, { ...value, [role]: e.target.value }) }),
    withToday && h('label', { class: 'tick' },
      h('input', { id: `f-${filter.id}-${role}-today`, type: 'checkbox', checked: !!value[flag], onchange: (e) => on.change(filter.id, { ...value, [flag]: e.target.checked, [role]: e.target.checked ? '' : value[role] }) }),
      ' current date'));
  return h('div', { class: 'date-range' }, end('from', 'fromToday'), end('to', 'toToday'));
}

function partControl(filter, part, label, scan, on, value) {
  const id = `f-${filter.id}-${part.role}`;
  const scanned = scan.parts.find((p) => p.role === part.role);
  const change = (e) => on.change(filter.id, { ...value, [part.role]: e.target.value });
  if (scanned?.options) {
    return h('select', { id, 'aria-label': label, onchange: change },
      ...scanned.options.map((o) => h('option', { value: o.value, selected: (value[part.role] ?? scanned.value) === o.value }, o.text.trim() || 'Any')));
  }
  return h('input', { id, type: 'text', 'aria-label': label, value: value[part.role] ?? scanned?.value ?? '', onchange: change });
}

function compoundControl(filter, scan, on) {
  const value = on.value(filter.id);
  const words = { operator: 'Compare', value: 'Value', value2: 'Second value', mode: 'Match', text: filter.label };
  // The second value only applies to Between (D41: the page hides it otherwise).
  const parts = filter.parts.filter((p) => p.role !== 'value2' || value.operator === 'Between');
  return h('div', { class: 'compound' }, ...parts.map((p) => partControl(filter, p, words[p.role], scan, on, value)));
}

function treeControl(flow, filter, scan, on) {
  const value = on.value(filter.id);
  if (scan.locked) return h('p', { class: 'locked' }, 'Fixed by your login: your own department.');
  const shown = value?.names?.length ? value.names.join('; ') : value?.name ?? scan.name ?? '';
  return h('div', { class: 'tree-control' },
    h('p', { id: `f-${filter.id}-shown`, class: shown ? 'tree-value' : 'tree-value empty' }, shown || (flow.rules.required.includes(filter.id) ? 'Not chosen' : 'All')),
    h('div', { class: 'row' },
      h('button', { id: `f-${filter.id}-open`, type: 'button', onclick: () => on.openTree(filter.id) }, on.treeOpen(filter.id) ? 'Close list' : 'Choose'),
      shown && h('button', { id: `f-${filter.id}-clear`, type: 'button', class: 'quiet', onclick: () => on.change(filter.id, filter.source === 'departmentTree' ? { id: '', name: '' } : { names: [] }) }, 'Clear')),
    on.treeOpen(filter.id) && on.renderTree(filter));
}

function controlFor(flow, filter, scan, on) {
  if (filter.control === 'tree') return treeControl(flow, filter, scan, on);
  if (filter.control === 'tabs') return tabsControl(filter, scan, on);
  if (filter.control === 'dateRange') return dateRangeControl(flow, filter, scan, on);
  if (filter.control === 'date') return dateControl(filter, scan, on);
  if (filter.parts) return compoundControl(filter, scan, on);
  if (scan.options) return selectControl(flow, filter, scan, on);
  return textControl(filter, scan, on);
}

function filterCard(flow, filter, scan, loggedIn, on, note) {
  const required = flow.rules.required.includes(filter.id);
  const warn = filter.warnWhen && (filter.warnWhen.state === 'always' || (filter.warnWhen.state === 'loggedIn') === loggedIn) ? filter.warnWhen.text : null;
  const parents = (filter.dependsOn ?? []).map((id) => flow.filters.find((f) => f.id === id)?.label).filter(Boolean);
  return h('div', { class: 'filter', 'data-filter': filter.id },
    h('label', { class: 'filter-label', for: `f-${filter.id}` }, filter.label, required && h('span', { class: 'req', title: 'Required' }, ' *')),
    controlFor(flow, filter, scan, on),
    parents.length > 0 && h('p', { class: 'hint' }, `↳ depends on ${parents.join(' and ')}`),
    scan.options && !scan.locked && h('p', { class: 'hint', 'data-count': filter.id }, `${scan.options.length} items`),
    note && h('p', { id: 'window-span', class: 'hint' }, note),
    warn && notice('warn', warn));
}

/** Screen shown when the tab isn't on a report page. */
export function renderNoPage(state) {
  return h('section', { class: 'card', id: 'no-page' },
    h('h2', {}, state.onPortal ? 'Open a report page' : 'Open e-GP, then a report page'),
    h('p', {}, 'The filters appear here when one of these pages is in front.'),
    h('ol', { class: 'flows' }, ...state.flows.map((f) => h('li', {},
      h('b', {}, `Flow ${f.number} · ${f.name}`),
      f.login === 'required' && h('span', { class: 'tag' }, 'needs a login'),
      h('br'), h('span', { class: 'hint' }, f.route.join(' → '))))));
}

/** Screen for a report page. */
export function renderFlow(state, on, now = new Date()) {
  const { flow, page } = state;
  const header = h('section', { class: 'card', id: 'flow-head' },
    h('h2', { id: 'flow-name' }, `Flow ${flow.number} · ${flow.name}`),
    h('p', { id: 'login-state', class: 'hint' }, page.loggedIn ? 'Logged in' : 'Logged out'),
    page.verdict.outcome === 'OK'
      ? notice('ok', 'Page matches this flow.')
      : page.verdict.outcome === 'LOGIN_WALL'
        ? notice('bad', `${flow.name} needs a login. Log in, then open this page again.`)
        : notice('bad', `This page doesn't match what the tool expects: ${page.verdict.reason}`));

  if (page.verdict.outcome === 'LOGIN_WALL') return h('div', {}, header);

  // D37: at the very beginning, before any filter. The choice is the user's.
  const warning = flow.login.startWarning;
  if (warning && (warning.state === 'loggedOut') === !page.loggedIn && !on.warningAccepted()) {
    return h('div', {}, header,
      h('section', { class: 'card warn-card', id: 'start-warning' },
        h('p', {}, warning.text),
        h('button', { id: 'warning-proceed', type: 'button', class: 'primary', onclick: () => on.acceptWarning() }, 'Proceed')));
  }

  const scans = Object.fromEntries(page.filters.map((s) => [s.id, s]));
  const panelFilters = flow.filters.filter((f) => f.panel);
  const vanished = panelFilters.filter((f) => scans[f.id]?.vanished);
  const shown = panelFilters.filter((f) => !scans[f.id]?.vanished);
  const values = Object.fromEntries(panelFilters.map((f) => [f.id, on.value(f.id)]));
  const today = todayOf(now);
  const result = evaluateStart(flow, values, { loggedIn: page.loggedIn, today });
  const reasons = [...vanished.map((f) => `${f.label} is no longer on this page. The portal has changed.`), ...result.reasons];
  const windowFilter = flow.rules.window?.filter;
  const win = windowFilter ? resolveWindow(values[windowFilter], today) : null;
  const windowNote = win?.from && win.to && win.from <= win.to
    ? `Window: ${formatDate(win.from)} to ${formatDate(win.to)}, ${spanText(spanBetween(win.from, win.to))}` : null;

  return h('div', {}, header,
    h('section', { class: 'card', id: 'filters' },
      ...shown.map((f) => filterCard(flow, f, scans[f.id], page.loggedIn, on, f.id === windowFilter && windowNote))),
    h('section', { class: 'card', id: 'plan' },
      reasons.length
        ? h('ul', { id: 'start-reasons', class: 'reasons' }, ...reasons.map((r) => h('li', {}, r)))
        : notice('ok', 'Filters are ready.'),
      result.exemptionUsed && notice('note', `Department and date aren't needed for this search, while it stays within ${result.maxRows.toLocaleString('en-US')} rows.`),
      h('button', { id: 'start', type: 'button', class: 'primary', disabled: true }, 'Start'),
      h('p', { class: 'hint' }, 'Collection arrives in a later stage of the build.')));
}
