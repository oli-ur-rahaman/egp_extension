// @ts-nocheck: draws from the profile and run records, free-form JSON. Behaviour is covered by the panel's e2e tests.
// What the user sees just before a run (size, checkerboard, estimate) and during it.

import { estimate, progressOf, timeLeft } from '../shared/estimate.js';
import { h, icon } from './icons.js';
import { banner } from './view.js';

const n = (value) => (value ?? 0).toLocaleString('en-US');

/** D25, D27, D32: the real size, what to collect, how long it will take. Nothing is ticked until the user chooses, unless they chose it last time. */
export function buildPlanSheet({ flow, plan, remembered, limit, onStart, onClose }) {
  const known = new Set(flow.detail?.fields.map((f) => f.id));
  const ticked = new Set(remembered.filter((id) => known.has(id)));
  const detail = flow.detail;
  const report = !!flow.report;
  const tooBig = limit !== null && plan.rows > limit;
  const empty = !report && plan.rows === 0;
  const box = h('div', { id: 'plan-estimate', class: 'estimate' });
  // D65, D68: National, International or both; which tables; all rows or only those with a number.
  let scope = 'all';
  const tables = new Set((flow.report?.tables ?? []).map((t) => t.budgetType));
  let rowsMode = 'all';
  const tableChoice = h('div', { class: 'scope', role: 'group', 'aria-label': 'Tables' },
    ...(flow.report?.tables ?? []).map((t) => h('label', { class: 'cluster' }, h('input', { type: 'checkbox', 'data-table': t.budgetType, checked: true, onchange: (e) => {
      if (e.target.checked) tables.add(t.budgetType);
      else tables.delete(t.budgetType);
      refresh();
    } }), h('span', {}, t.budgetType))));
  const rowsChoice = h('div', { class: 'scope', role: 'radiogroup', 'aria-label': 'Rows' },
    ...[['all', 'All rows, as the report shows them'], ['nonzero', 'Only rows with a number: leave out rows that are all zeros']].map(([value, text]) =>
      h('label', { class: 'cluster' }, h('input', { type: 'radio', name: 'rows', value, 'data-rows': value, checked: value === rowsMode, onchange: () => { rowsMode = value; } }), h('span', {}, text))));
  const scopeChoice = h('div', { class: 'scope', role: 'radiogroup', 'aria-label': 'Columns' },
    ...[['all', 'All: National and International'], ['national', 'National only'], ['international', 'International only']].map(([value, text]) =>
      h('label', { class: 'cluster' }, h('input', { type: 'radio', name: 'scope', value, 'data-scope': value, checked: value === scope, onchange: () => { scope = value; } }), h('span', {}, text))));
  const go = h('button', { id: 'run-start', type: 'button', class: 'btn filled' }, 'Start collecting');
  const agree = h('input', { id: 'plan-agree', type: 'checkbox' });
  const agreeWords = h('span', {});
  const agreeLine = h('label', { id: 'plan-agree-line', class: 'cluster agree', hidden: true }, agree, agreeWords);
  let mustAgree = false;

  function refresh() {
    const listRequests = report ? plan.offices.length : plan.totalPages;
    const detailRequests = ticked.size ? plan.rows : 0;
    const time = estimate({ pacing: plan.pacing, listRequests, detailRequests });
    // Filtered: a condition that's false would otherwise print the word.
    box.replaceChildren(...[
      h('b', {}, time.text),
      h('span', { class: 'parts' }, report ? `One report at a time, ${n(plan.offices.length)} in all` : ticked.size ? `List ${time.listText}, detail pages ${time.detailText}` : `List only, ${time.listText}`),
      time.level !== 'ok' && h('p', { class: 'hint warn' }, time.level === 'unrealistic'
        ? 'Too long for one sitting. To shorten it: collect the list only, narrow the dates, or choose one Procuring Entity.'
        : 'Over 6 hours. To shorten it: collect the list only, narrow the dates, or choose one Procuring Entity. Progress is saved if you stop.'),
    ].filter(Boolean));
    mustAgree = time.level === 'unrealistic';
    agreeLine.hidden = !mustAgree;
    agreeWords.textContent = `I understand this will take ${time.text.replace(/^About /, 'about ')}. Tick to start.`;
    if (!mustAgree) agree.checked = false;
    agreeLine.classList.remove('asked');
    // Start stays pressable when only the tick is missing, and says what's missing: a greyed button explains nothing.
    go.disabled = tooBig || empty || (report && tables.size === 0);
  }
  agree.addEventListener('change', refresh);

  // D55: each group opens to its fields, and what's ticked here is what the file holds.
  const groups = detail ? detail.clusters.map((cluster) => {
    const fields = detail.fields.filter((f) => f.cluster === cluster.id && !f.sameAs);
    if (!fields.length) return null;
    const count = h('small', { 'data-count': cluster.id });
    const all = h('input', { type: 'checkbox', 'data-cluster': cluster.id, 'aria-label': `All of ${cluster.name}` });
    const boxes = fields.map((f) => h('input', { type: 'checkbox', 'data-field': f.id, checked: ticked.has(f.id), onchange: (e) => {
      if (e.target.checked) ticked.add(f.id);
      else ticked.delete(f.id);
      show();
      refresh();
    } }));
    const show = () => {
      const on = fields.filter((f) => ticked.has(f.id)).length;
      all.checked = on === fields.length;
      all.indeterminate = on > 0 && on < fields.length;
      count.textContent = on === 0 ? `${fields.length} fields` : on === fields.length ? `All ${fields.length} fields` : `${on} of ${fields.length} fields`;
      boxes.forEach((box, i) => { box.checked = ticked.has(fields[i].id); });
    };
    all.addEventListener('change', () => {
      for (const f of fields) {
        if (all.checked) ticked.add(f.id);
        else ticked.delete(f.id);
      }
      show();
      refresh();
    });
    const list = h('div', { class: 'cluster-fields', hidden: true, id: `fields-${cluster.id}` },
      ...fields.map((f, i) => h('label', { class: 'cluster-field' }, boxes[i], h('span', {}, f.header.replace(/^Older: /, ''), f.older && h('small', {}, 'older contract pages only')))));
    const twist = h('button', { type: 'button', class: 'twist', 'aria-label': `Show the fields of ${cluster.name}`, 'aria-expanded': 'false', onclick: () => {
      const open = list.hidden;
      list.hidden = !open;
      twist.setAttribute('aria-expanded', String(open));
    } }, icon('chevronRight'));
    show();
    return h('div', { class: 'cluster-group' },
      h('div', { class: 'cluster-head' }, twist, h('label', { class: 'cluster' }, all, h('span', {}, cluster.name, count))),
      list);
  }).filter(Boolean) : [];

  refresh();
  go.addEventListener('click', () => {
    if (mustAgree && !agree.checked) {
      agreeLine.classList.add('asked');
      agree.focus({ preventScroll: true });
      return;
    }
    go.disabled = true;
    const chosen = [...ticked];
    const clusterIds = detail ? detail.clusters.map((c) => c.id).filter((id) => detail.fields.some((f) => f.cluster === id && ticked.has(f.id))) : [];
    onStart(clusterIds, chosen, { scope, tables: report ? [...tables] : null, rowsMode });
  });

  return h('div', { class: 'sheet', style: 'display:contents', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Before you start' },
    h('header', { class: 'sheet-head' },
      h('h2', {}, 'Before you start'),
      h('button', { id: 'plan-close', type: 'button', class: 'icon-btn', 'aria-label': 'Back to filters', onclick: onClose }, icon('close'))),
    h('div', { class: 'plan-body' },
      report
        ? h('p', { class: 'plan-count', id: 'plan-count' }, `${n(plan.offices.length)} ${plan.offices.length === 1 ? 'report' : 'reports'}`)
        : h('p', { class: 'plan-count', id: 'plan-count' }, `${n(plan.rows)} rows`),
      report && h('p', { class: 'plan-sub', id: 'plan-sizes' }, [
        plan.sizes ? `${n(plan.sizes.financial_year ?? 1)} ${plan.sizes.financial_year === 1 ? 'year' : 'years'} × ${plan.project && plan.offices.every((c) => c.fields.offId === '0') ? 'all offices in one report' : `${n(plan.sizes.pe_office ?? 1)} ${plan.sizes.pe_office === 1 ? 'office' : 'offices'}`}${plan.sizes.project ? ` × ${n(plan.sizes.project)} ${plan.sizes.project === 1 ? 'project' : 'projects'}` : ''}.` : null,
      ].filter(Boolean).join(' ')),
      report && h('h3', { class: 'plan-h' }, 'Columns'),
      report && scopeChoice,
      report && h('h3', { class: 'plan-h' }, 'Tables, one sheet each'),
      report && tableChoice,
      report && h('h3', { class: 'plan-h' }, 'Rows'),
      report && rowsChoice,
      // D66: each office is its own search, so each is named with what the portal holds for it.
      plan.searches && h('div', { id: 'plan-offices', class: 'plan-offices' },
        h('p', { class: 'plan-sub' }, `${n(plan.searches.length)} offices, searched one at a time. The e-GP page itself keeps showing its own search; these are what the tool collects:`),
        h('ul', {}, ...plan.searches.map((s) => h('li', { 'data-office': s.key }, h('span', {}, s.labels.office), h('b', {}, `${s.pages > 1 ? 'about ' : ''}${n(s.rows)} rows`))))),
      !report && !plan.searches && h('p', { class: 'plan-sub' }, empty ? 'The portal has no records for these filters.' : `${n(plan.totalPages)} list ${plan.totalPages === 1 ? 'page' : 'pages'} at ${plan.size} rows each, as the portal counts them right now.`),
      tooBig && banner('bad', `A search by this kind of filter can't go over ${n(limit)} rows. Add Department and a date window to narrow it.`, 'Too many rows'),
      detail && h('h3', { class: 'plan-h' }, 'Detail-page data to collect'),
      detail && h('p', { class: 'hint' }, "Open a group to pick its fields. One page holds them all, so ticking more doesn't take longer. Only what you tick goes in the file."),
      ...groups),
    // Always in view, directly above Start (TIME_ESTIMATE §1).
    h('footer', { class: 'plan-end' }, box, agreeLine,
      h('div', { class: 'plan-foot' },
        h('button', { type: 'button', class: 'btn text', onclick: onClose }, 'Back'),
        go)));
}

/** The run's own screen. */
export function renderRun(run, actions, flowName) {
  const open = run.status === 'running' || run.status === 'paused';
  const title = { running: 'Collecting', paused: 'Paused', finished: 'Finished', stopped: 'Stopped' }[run.status];
  const progress = Math.round(progressOf(run) * 100);
  const left = timeLeft(run);
  const numbers = [];
  if (run.offices) {
    numbers.push(['Reports done', `${n(run.officeIndex)} of ${n(run.offices.length)}`], ['Rows collected', n(run.stats.rows)]);
    if (run.stats.emptyReports) numbers.push(['Reports with no figures', n(run.stats.emptyReports)]);
    // What the file will hold, so the choice made before Start can be seen (owner, 2026-11-11).
    numbers.push(['In the file', `${(run.tables ?? ['Development', 'Revenue', 'Own Fund']).join(', ')}; ${{ all: 'National and International', national: 'National only', international: 'International only' }[run.scope ?? 'all']}; ${run.rowsMode === 'nonzero' ? 'rows with a number' : 'all rows'}`]);
  } else {
    numbers.push(['Rows collected', run.expected ? `${n(run.stats.rows)} of ${n(run.expected)}` : n(run.stats.rows)]);
    if (run.searches && run.phase === 'list' && run.status !== 'finished') numbers.push(['Office', `${n(run.searchIndex + 1)} of ${n(run.searches.length)}: ${run.searches[run.searchIndex].labels.office}`]);
    if (run.phase === 'list' && run.status !== 'finished') numbers.push(['List page', `${n(run.page)} of ${n(run.totalPages)}`]);
    if (run.clusters.length) numbers.push(['Detail pages read', `${n(run.stats.detailDone)} of ${n(run.stats.detailTotal || run.expected)}`]);
    if (run.stats.refused) numbers.push(['Refused by the portal', n(run.stats.refused)]);
    if (run.stats.detailFailed) numbers.push(["Couldn't read", n(run.stats.detailFailed)]);
  }
  if (left) numbers.push(['Time left', left.startsWith('under') ? left : `about ${left}`]);

  const kind = run.pauseKind === 'block' || run.pauseKind === 'shape' ? 'bad' : 'warn';
  return h('div', { id: 'run-view' },
    h('section', { class: 'flow-head' }, h('h2', { id: 'flow-name' }, flowName ?? '')),
    run.status === 'paused' && run.pauseKind !== 'user' && banner(kind, run.reason ?? '', 'Paused'),
    h('section', { class: 'run-card' },
      h('div', { id: 'run-state', class: run.status === 'finished' ? 'run-state done' : 'run-state' }, run.status === 'finished' && icon('check'), title),
      h('div', { class: 'meter', role: 'progressbar', 'aria-valuenow': String(progress), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('div', { style: `width:${progress}%` })),
      h('dl', { id: 'run-numbers', class: 'run-numbers' }, ...numbers.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      run.status === 'running' && (run.note || run.reason) && h('p', { class: 'run-note', id: 'run-note' }, run.reason ?? run.note),
      h('div', { class: 'run-actions' },
        run.status === 'running' && h('button', { id: 'run-pause', type: 'button', class: 'btn', onclick: actions.pause }, 'Pause'),
        run.status === 'paused' && h('button', { id: 'run-resume', type: 'button', class: 'btn filled', onclick: actions.resume }, 'Resume'),
        open && h('button', { id: 'run-stop', type: 'button', class: 'btn', onclick: actions.stop }, 'Stop'),
        h('button', { id: 'run-download', type: 'button', class: open ? 'btn' : 'btn filled', onclick: actions.download }, open ? 'Download what I have' : 'Download Excel'),
        !open && h('button', { id: 'run-new', type: 'button', class: 'btn text', onclick: actions.finishAndClear }, 'New search')),
      open && h('p', { class: 'run-note' }, 'You can work in other tabs; this never brings a tab to the front. Keep the e-GP tab open. Progress is saved after every step.'),
      !open && h('p', { class: 'run-note' }, 'New search removes this run from the tool. Download the file first.')));
}
