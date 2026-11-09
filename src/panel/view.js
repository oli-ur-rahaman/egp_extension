// @ts-nocheck: draws from the profile's free-form JSON, so types would all be `any`. Its behaviour is covered by the panel's e2e tests.
// Draws the panel from state. No messaging here, so every screen can be tested on its own.
// Filter controls call `on.change(filterId, value)`; the controller applies it to the real page, then redraws.

import { combo } from './combo.js';
import { h, icon } from './icons.js';
import { evaluateStart, formatDate, isSet, parseDate, resolveWindow, spanBetween, spanText, todayOf } from '../shared/filter-rules.js';

/** Above this many entries a list gets a search box. */
const SEARCH_ABOVE = 12;
/** Up to this many optional filters are simply shown; more fold away. */
const FOLD_ABOVE = 3;

/** @param {string} kind warn, bad, note or ok @param {string} text @param {string} [title] @param {Node} [action] */
export function banner(kind, text, title, action) {
  const name = { ok: 'check', warn: 'warning', bad: 'error', note: 'info' }[kind];
  return h('div', { class: `banner ${kind}`, role: kind === 'bad' ? 'alert' : undefined }, icon(name),
    h('div', { class: 'banner-body' }, title && h('b', {}, title), h('span', {}, text), action));
}

/** The first entry of a dropdown: All, or a prompt when a choice is required. */
/** Required on its own: listed as required, or alone in its group (D58). */
export const mustHave = (flow, id) => flow.rules.required.includes(id) || (flow.rules.groups ?? []).some((g) => g.anyOf.length === 1 && g.anyOf[0] === id);

function emptyLabel(flow, filter) {
  const required = mustHave(flow, filter.id);
  return required ? `Choose ${filter.label.replace(/^(Select|By) /, '')}` : 'All';
}

function listControl(id, value, options, onChange) {
  if (options.length > SEARCH_ABOVE) return combo({ id, value, options, onChange });
  return h('select', { id, onchange: (e) => onChange(e.target.value) },
    ...options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.text)));
}

/** D66: PWD's office list opens the office picker. */
function officeControl(filter, scan, on) {
  const value = on.value(filter.id);
  const name = (v) => scan.options.find((o) => o.value === v)?.text;
  const shown = Array.isArray(value) ? `${value.length} offices` : value && value !== '__all__' && name(value) ? name(value) : `All offices (${scan.options.length.toLocaleString('en-US')})`;
  return h('button', { id: `f-${filter.id}`, type: 'button', class: 'field-button', 'aria-haspopup': 'dialog', 'data-offices': Array.isArray(value) ? String(value.length) : value && value !== '__all__' && name(value) ? '1' : 'all', onclick: () => on.openOffices(filter.id) },
    h('span', { class: 'tree-value' }, shown), icon('chevronRight'));
}

/** D68: years and projects, one or many, from a searchable list. */
function listPickControl(filter, scan, on) {
  const value = on.value(filter.id);
  const names = Array.isArray(value) ? value.map((v) => scan.options.find((o) => o.value === v)?.text).filter(Boolean) : [];
  const none = (filter.allLabel ?? 'All').replace(' ({n})', '').replace('{n}', '');
  const shown = names.length === 0 ? none : names.length <= 2 ? names.join(', ') : `${names.length} chosen`;
  return h('button', { id: `f-${filter.id}`, type: 'button', class: 'field-button', 'aria-haspopup': 'dialog', 'data-chosen': String(names.length), onclick: () => on.openList(filter.id) },
    h('span', { class: names.length ? 'tree-value' : 'tree-value empty' }, shown), icon('chevronRight'));
}

function selectControl(flow, filter, scan, on) {
  const id = `f-${filter.id}`;
  if (filter.picker === 'list') return listPickControl(filter, scan, on);
  if (on.officeTree?.(filter.id)) return officeControl(filter, scan, on);
  const change = (v) => on.change(filter.id, v);
  if (filter.allMeansLoop) {
    const drafted = on.draft(filter.id);
    const allText = (filter.allLabel ?? 'All ({n})').replace('{n}', scan.options.length.toLocaleString('en-US'));
    return listControl(id, drafted === '__all__' ? '__all__' : scan.value, [{ value: '__all__', text: allText }, ...scan.options], change);
  }
  const hasAll = !filter.choices && !filter.default;
  const onEmpty = scan.options.every((o) => o.value !== scan.value);
  const empty = filter.empty ?? '';
  const options = hasAll ? [{ value: empty, text: emptyLabel(flow, filter) }, ...scan.options] : scan.options;
  return listControl(id, onEmpty && hasAll ? empty : scan.value, options, change);
}

function tabsControl(filter, scan, on) {
  return h('select', { id: `f-${filter.id}`, onchange: (e) => on.change(filter.id, e.target.value) },
    ...filter.choices.map((c) => h('option', { value: c.value, selected: scan.value === c.value }, c.label)));
}

function textControl(filter, scan, on) {
  return h('input', { id: `f-${filter.id}`, type: 'text', value: scan.value ?? '', autocomplete: 'off', onchange: (e) => on.change(filter.id, e.target.value) });
}

/** A date typed as dd/mm/yyyy, the portal's own format, or picked from a calendar. */
function dateBox(id, label, value, disabled, onChange) {
  const toPicker = () => {
    const d = parseDate(value ?? '');
    return d ? d.toISOString().slice(0, 10) : '';
  };
  const native = h('input', { type: 'date', tabindex: '-1', 'aria-hidden': 'true', value: toPicker(), onchange: (e) => {
    if (e.target.value) onChange(e.target.value.split('-').reverse().join('/'));
  } });
  return h('div', { class: 'date-box' },
    h('input', { id, type: 'text', placeholder: 'dd/mm/yyyy', 'aria-label': label, value: value ?? '', disabled, autocomplete: 'off', onchange: (e) => onChange(e.target.value) }),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Pick ${label} from a calendar`, disabled, onclick: () => native.showPicker() }, icon('calendar')),
    native);
}

function dateControl(filter, scan, on) {
  return dateBox(`f-${filter.id}`, filter.label, scan.value, false, (v) => on.change(filter.id, v));
}

function dateRangeControl(flow, filter, scan, on) {
  const value = on.value(filter.id);
  const withToday = flow.rules.window?.filter === filter.id && flow.rules.window.currentDateCheckboxes;
  const end = (role, flag) => h('div', { class: 'date-end' },
    h('label', { for: `f-${filter.id}-${role}` }, role === 'from' ? 'From' : 'To'),
    dateBox(`f-${filter.id}-${role}`, `${filter.label} ${role === 'from' ? 'From' : 'To'}`, value[flag] ? formatDate(todayOf(new Date())) : value[role], !!value[flag], (v) => on.change(filter.id, { ...on.value(filter.id), [role]: v })),
    withToday && h('label', { class: 'tick' },
      h('input', { id: `f-${filter.id}-${role}-today`, type: 'checkbox', checked: !!value[flag], onchange: (e) => on.change(filter.id, { ...on.value(filter.id), [flag]: e.target.checked, [role]: e.target.checked ? '' : on.value(filter.id)[role] }) }),
      'Current date'));
  return h('div', { class: 'date-range' }, end('from', 'fromToday'), end('to', 'toToday'));
}

function partControl(filter, part, label, scan, on, value) {
  const id = `f-${filter.id}-${part.role}`;
  const scanned = scan.parts.find((p) => p.role === part.role);
  const change = (e) => on.change(filter.id, { ...on.value(filter.id), [part.role]: e.target.value });
  if (scanned?.options) {
    return h('select', { id, 'aria-label': label, onchange: change },
      ...scanned.options.map((o) => h('option', { value: o.value, selected: (value[part.role] ?? scanned.value) === o.value }, o.text.trim() || 'Any')));
  }
  return h('input', { id, type: 'text', 'aria-label': label, autocomplete: 'off', placeholder: label, value: value[part.role] ?? scanned?.value ?? '', onchange: change });
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
  return h('div', { class: shown ? 'field-with-clear has-value' : 'field-with-clear' },
    h('button', { id: `f-${filter.id}-open`, type: 'button', class: 'field-button', 'aria-haspopup': 'dialog', onclick: () => on.openTree(filter.id) },
      h('span', { id: `f-${filter.id}-shown`, class: shown ? 'tree-value' : 'tree-value empty' }, shown || (mustHave(flow, filter.id) ? 'Not chosen' : 'All')),
      !shown && icon('chevronRight')),
    shown && h('button', { id: `f-${filter.id}-clear`, type: 'button', class: 'icon-btn', 'aria-label': `Clear ${filter.label}`, onclick: () => on.change(filter.id, filter.source === 'departmentTree' ? { id: '', name: '' } : { names: [] }) }, icon('close')));
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
  const required = mustHave(flow, filter.id);
  const warn = filter.warnWhen && (filter.warnWhen.state === 'always' || (filter.warnWhen.state === 'loggedIn') === loggedIn) ? filter.warnWhen.text : null;
  const parents = (filter.dependsOn ?? []).map((id) => flow.filters.find((f) => f.id === id)?.label).filter(Boolean);
  const count = scan.options?.length;
  return h('div', { class: 'filter', 'data-filter': filter.id },
    h('label', { class: 'filter-label', for: `f-${filter.id}` }, filter.label.replace(/^(Select|By) /, ''), required && h('span', { class: 'req', title: 'Required' }, ' *')),
    controlFor(flow, filter, scan, on),
    scan.options && !scan.locked && h('p', { class: 'hint', 'data-count': filter.id },
      count === 0 && parents.length ? `Choose ${parents.join(' and ')} first` : `${count.toLocaleString('en-US')} items`),
    note && h('p', { id: 'window-span', class: 'hint' }, note),
    warn && h('p', { class: 'hint warn' }, warn));
}

/** Screen shown when the tab isn't on a report page. */
export function renderNoPage(state) {
  return h('section', { id: 'no-page' },
    h('div', { class: 'empty-state' },
      h('h2', {}, state.onPortal ? 'Open a report page' : 'Open e-GP, then a report page'),
      h('p', {}, 'The filters appear here when this tab is on one of these pages.')),
    h('ol', { class: 'flows' }, ...state.flows.map((f) => h('li', {},
      h('div', { class: 'flow-title' }, `Flow ${f.number} · ${f.name}`, f.login === 'required' && h('span', { class: 'tag' }, 'needs a login')),
      h('p', { class: 'hint' }, f.route.join(' → '))))));
}

/** True when the filter differs from where it started, so Clear all has something to do. */
export function isChanged(filter, value) {
  if (filter.default !== undefined) return value !== filter.default;
  if (filter.allMeansLoop) return value !== '__all__';
  return isSet(filter, value);
}

/** Screen for a report page. */
export function renderFlow(state, on, now = new Date()) {
  const { flow, page } = state;
  const header = h('section', { class: 'flow-head', id: 'flow-head' },
    h('p', { class: 'overline' }, `FLOW ${flow.number}`),
    h('h2', { id: 'flow-name' }, flow.name),
    h('div', { class: 'meta' },
      h('span', { id: 'login-state', class: page.loggedIn ? 'chip on' : 'chip' }, page.loggedIn ? 'Logged in' : 'Logged out'),
      page.verdict.outcome === 'OK' && h('span', { id: 'page-match', class: 'matched' }, icon('check'), 'Page recognised')));

  if (page.verdict.outcome === 'LOGIN_WALL') {
    return h('div', { id: 'flow-view' }, header, banner('warn', 'Log in, then open this page again.', `${flow.name} needs a login`));
  }
  const pageProblem = page.verdict.outcome !== 'OK' && banner('bad', page.verdict.reason, "This page isn't what the tool expects");

  // D37: at the very beginning, before any filter. The choice is the user's.
  const warning = flow.login.startWarning;
  if (warning && (warning.state === 'loggedOut') === !page.loggedIn && !on.warningAccepted()) {
    return h('div', { id: 'flow-view' }, header, pageProblem,
      h('section', { class: 'warn-card', id: 'start-warning' },
        h('div', { class: 'warn-title' }, icon('warning'), 'Before you continue'),
        h('p', {}, warning.text),
        h('div', { class: 'row' }, h('button', { id: 'warning-proceed', type: 'button', class: 'btn filled', onclick: () => on.acceptWarning() }, 'Proceed'))));
  }

  const scans = Object.fromEntries(page.filters.map((s) => [s.id, s]));
  const panelFilters = flow.filters.filter((f) => f.panel);
  const vanished = panelFilters.filter((f) => scans[f.id]?.vanished);
  const present = panelFilters.filter((f) => !scans[f.id]?.vanished);
  const values = Object.fromEntries(panelFilters.map((f) => [f.id, on.value(f.id)]));
  const today = todayOf(now);
  const result = evaluateStart(flow, values, { loggedIn: page.loggedIn, today });
  const reasons = [...vanished.map((f) => `${f.label} is no longer on this page. The portal has changed.`), ...result.reasons];
  const windowFilter = flow.rules.window?.filter;
  const win = windowFilter ? resolveWindow(values[windowFilter], today) : null;
  const windowNote = win?.from && win.to && win.from <= win.to
    ? `Window: ${formatDate(win.from)} to ${formatDate(win.to)}, ${spanText(spanBetween(win.from, win.to))}` : null;

  const card = (f) => filterCard(flow, f, scans[f.id], page.loggedIn, on, f.id === windowFilter && windowNote);
  const isMain = (f) => flow.rules.required.includes(f.id) || f.id === windowFilter || (flow.rules.groups ?? []).some((g) => g.anyOf.includes(f.id));
  const main = present.filter(isMain);
  const others = present.filter((f) => !isMain(f));
  const fold = others.length > FOLD_ABOVE;
  const changed = present.filter((f) => !scans[f.id]?.locked && isChanged(f, values[f.id]) && !(f.id === windowFilter && values[f.id]?.fromToday && values[f.id]?.toToday));
  const changedOthers = others.filter((f) => changed.includes(f)).length;

  return h('div', { id: 'flow-view' }, header, pageProblem,
    h('section', { class: 'section', id: 'filters' },
      h('div', { class: 'section-head' },
        h('h3', {}, 'Filters'),
        changed.length > 0 && h('button', { id: 'clear-all', type: 'button', class: 'btn text', onclick: () => on.clearAll(changed) }, 'Clear all')),
      ...main.map(card),
      ...(fold ? [] : others.map(card))),
    fold && h('details', { class: 'section', id: 'more-filters', open: on.moreOpen() },
      // Noted at the click: Chrome reports the fold's change late, and a redraw in between would shut it.
      h('summary', { onclick: (e) => on.setMoreOpen(!e.currentTarget.parentElement.open) }, icon('chevronRight'), 'More filters', changedOthers > 0 && h('span', { class: 'count', title: 'Filters set here' }, String(changedOthers))),
      ...others.map(card)),
    h('section', { class: 'action-bar', id: 'plan' },
      reasons.length
        ? h('ul', { id: 'start-reasons', class: 'reasons' }, ...reasons.map((r) => h('li', {}, r)))
        : h('p', { class: 'ready' }, icon('check'), 'Filters are ready.'),
      result.exemptionUsed && h('p', { class: 'exempt' }, `Department and date aren't needed for this search, while it stays within ${result.maxRows.toLocaleString('en-US')} rows.`),
      h('button', { id: 'start', type: 'button', class: 'btn filled wide', disabled: !result.ok || vanished.length > 0, onclick: () => on.startPlan(values, result) }, 'Start')));
}
