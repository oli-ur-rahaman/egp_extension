// @ts-nocheck: draws from the profile and run records, free-form JSON. Behaviour is covered by the panel's e2e tests.
// What the user sees just before a run (size, checkerboard, estimate) and during it.

import { estimate, progressOf, timeLeft } from '../shared/estimate.js';
import { h, icon } from './icons.js';
import { banner } from './view.js';

const n = (value) => (value ?? 0).toLocaleString('en-US');

/** D25, D27, D32: the real size, what to collect, how long it will take. Nothing is ticked until the user chooses, unless they chose it last time. */
export function buildPlanSheet({ flow, plan, remembered, limit, onStart, onClose }) {
  const ticked = new Set(remembered);
  const detail = flow.detail;
  const report = !!flow.report;
  const tooBig = limit !== null && plan.rows > limit;
  const empty = !report && plan.rows === 0;
  const box = h('div', { id: 'plan-estimate', class: 'estimate' });
  const go = h('button', { id: 'run-start', type: 'button', class: 'btn filled' }, 'Start collecting');
  const agree = h('input', { id: 'plan-agree', type: 'checkbox' });
  const agreeLine = h('label', { class: 'cluster', hidden: true }, agree, h('span', {}, 'I understand this will take a long time.'));

  function refresh() {
    const listRequests = report ? plan.offices.length : plan.totalPages;
    const detailRequests = ticked.size ? plan.rows : 0;
    const time = estimate({ pacing: plan.pacing, listRequests, detailRequests });
    box.replaceChildren(
      h('b', {}, time.text),
      h('span', { class: 'parts' }, report ? `One report for each of ${n(plan.offices.length)} offices` : ticked.size ? `List ${time.listText}, detail pages ${time.detailText}` : `List only, ${time.listText}`),
      time.level !== 'ok' && h('p', { class: 'hint warn' }, time.level === 'unrealistic'
        ? 'Too long for one sitting. To shorten it: collect the list only, narrow the dates, or choose one Procuring Entity.'
        : 'Over 6 hours. To shorten it: collect the list only, narrow the dates, or choose one Procuring Entity. Progress is saved if you stop.'),
    );
    agreeLine.hidden = time.level !== 'unrealistic';
    go.disabled = tooBig || empty || (time.level === 'unrealistic' && !agree.checked);
  }
  agree.addEventListener('change', refresh);

  const clusters = detail ? detail.clusters.map((cluster) => {
    const fields = detail.fields.filter((f) => f.cluster === cluster.id && !f.sameAs);
    const tick = h('input', { type: 'checkbox', 'data-cluster': cluster.id, checked: ticked.has(cluster.id), onchange: (e) => {
      if (e.target.checked) ticked.add(cluster.id);
      else ticked.delete(cluster.id);
      refresh();
    } });
    return h('label', { class: 'cluster' }, tick, h('span', {}, cluster.name, h('small', {}, fields.slice(0, 4).map((f) => f.header).join(', ') + (fields.length > 4 ? ` and ${fields.length - 4} more` : ''))));
  }) : [];

  refresh();
  go.addEventListener('click', () => {
    go.disabled = true;
    onStart([...ticked]);
  });

  return h('div', { class: 'sheet', style: 'display:contents', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Before you start' },
    h('header', { class: 'sheet-head' },
      h('h2', {}, 'Before you start'),
      h('button', { id: 'plan-close', type: 'button', class: 'icon-btn', 'aria-label': 'Back to filters', onclick: onClose }, icon('close'))),
    h('div', { class: 'plan-body' },
      report
        ? h('p', { class: 'plan-count', id: 'plan-count' }, `${n(plan.offices.length)} ${plan.offices.length === 1 ? 'office' : 'offices'}`)
        : h('p', { class: 'plan-count', id: 'plan-count' }, `${n(plan.rows)} rows`),
      !report && h('p', { class: 'plan-sub' }, empty ? 'The portal has no records for these filters.' : `${n(plan.totalPages)} list ${plan.totalPages === 1 ? 'page' : 'pages'} at ${plan.size} rows each, as the portal counts them right now.`),
      tooBig && banner('bad', `A search by this kind of filter can't go over ${n(limit)} rows. Add Department and a date window to narrow it.`, 'Too many rows'),
      detail && h('h3', { class: 'plan-h' }, 'Detail-page data to collect'),
      detail && h('p', { class: 'hint' }, "One page holds all its fields, so ticking more doesn't take longer. The choice that matters is some or none."),
      ...clusters),
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
    numbers.push(['Offices done', `${n(run.officeIndex)} of ${n(run.offices.length)}`], ['Rows collected', n(run.stats.rows)]);
  } else {
    numbers.push(['Rows collected', run.expected ? `${n(run.stats.rows)} of ${n(run.expected)}` : n(run.stats.rows)]);
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
