// @ts-nocheck: a live check script; it drives the panel and only counts what comes back.
// Live check of Flow 1's 8 combinations (D68), driven through the panel in the debug Chrome. Small sizes; the tool's own polite pace.
// Prints counts only. Before: `npm run chrome`, the owner logs in there, opens Reports > Procurement Transaction Report,
// loads dist/ in that window, and opens the panel once (or run tools/recon/live-reload.js).
//   node tools/recon/live-flow1.js                 all 8, about 15 minutes
//   ONLY=1.8,1.6 node tools/recon/live-flow1.js    some of them
// OFFICES (default 1552,1231) and YEARS (default 2023-2024,2024-2025) can be set the same way. Projects are the first two of the first office's.
// Log each run in docs/recon/self-run-log.md.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
const root = process.cwd();
const OUT = process.env.OUT ?? path.join(process.cwd(), 'recon', 'raw', `live-flow1-${Date.now()}.txt`);
const log = (line) => { appendFileSync(OUT, `${line}\n`); console.log(line); };
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `start ${new Date().toISOString()}\n`);
const { chromium } = await import(pathToFileURL(path.join(root, 'node_modules/@playwright/test/index.mjs')).href);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222').catch(() => {
  console.error('No debug Chrome on port 9222. Run `npm run chrome`, log in to e-GP there, open Reports > Procurement Transaction Report, then run this again.');
  process.exit(1);
});
const context = browser.contexts()[0];
const report = context.pages().find((p) => p.url().includes('/report/ProcTransReport.jsp'));
const panel = context.pages().find((p) => p.url().includes('/panel/index.html'));
panel.setDefaultTimeout(30000);

// Offices and projects to use: office 1552 owns many projects (checked earlier); 1231 is another division.
const OFFICES = (process.env.OFFICES ?? '1552,1231').split(',');
const projects = await report.evaluate(async (first) => {
  const r = await fetch('/APPReportServlet', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ param2: 'All', param1: first, funName: 'getProject' }) });
  const d = new DOMParser().parseFromString(`<select>${await r.text()}</select>`, 'text/html');
  return [...d.querySelectorAll('option')].map((o) => ({ value: o.value, text: o.text.trim() })).filter((o) => o.value && o.value !== '0');
}, OFFICES[0]);
const PROJECTS = projects.slice(0, 2);
const officeNames = await report.evaluate((ids) => ids.map((id) => [...document.getElementById('cmboffice').options].find((o) => o.value === id).text.trim()), OFFICES);
log(`offices ${OFFICES.join(',')} projects ${PROJECTS.map((p) => p.value).join(',')} (of ${projects.length} for office ${OFFICES[0]})`);

const clearSheet = () => panel.locator('#sheet .sheet-foot .btn', { hasText: 'Clear' }).click();
async function pickYears(years) {
  await panel.locator('#f-financial_year').click();
  await clearSheet();
  for (const y of years) {
    await panel.locator('#list-search').fill(y);
    await panel.locator(`#sheet input[data-value="${y}"]`).check();
  }
  await panel.locator('#list-done').click();
}
async function pickOffices(ids) {
  await panel.locator('#f-pe_office').click();
  await clearSheet();
  for (const [i, id] of ids.entries()) {
    await panel.locator('#offices-search').fill(officeNames[OFFICES.indexOf(id)] ?? '');
    await panel.locator(`input[data-office="${id}"]`).first().check();
    void i;
  }
  await panel.locator('#offices-done').click();
}
async function pickProjects(list) {
  await panel.locator('#f-project').click();
  await clearSheet();
  for (const p of list) {
    await panel.locator('#list-search').fill(p.text.slice(0, 40));
    await panel.locator(`#sheet input[data-value="${p.value}"]`).check();
  }
  await panel.locator('#list-done').click();
}
const runRows = () => panel.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('pdms-runs'); r.onsuccess = () => res(r.result); r.onerror = rej; });
  const all = (store) => new Promise((res) => { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); });
  const runs = (await all('runs')).sort((a, b) => b.startedAt - a.startedAt);
  const run = runs[0];
  const rows = (await all('rows')).filter((r) => r.runId === run.id);
  const nums = (r) => Object.entries(r.list).filter(([k]) => /national|international/.test(k)).map(([, v]) => Number(v) || 0);
  return {
    status: run.status, reportsDone: run.officeIndex, reports: run.offices.length, empty: run.stats.emptyReports ?? 0, rows: rows.length,
    withNumbers: rows.filter((r) => nums(r).some((v) => v !== 0)).length,
    years: [...new Set(rows.map((r) => r.list.financial_year))].length, offices: [...new Set(rows.map((r) => r.list.pe_office))].length,
    projects: [...new Set(rows.map((r) => r.list.project).filter(Boolean))].length,
    sentOffices: [...new Set(run.offices.map((c) => c.fields.offId))].slice(0, 4).join(','), sentProjects: [...new Set(run.offices.map((c) => c.fields.project))].join(','),
  };
});
const runText = () => panel.locator('#run-view').innerText().catch(() => '');

const Y2 = (process.env.YEARS ?? '2023-2024,2024-2025').split(',');
const cases = [
  { name: '1.1', years: null, offices: null, projects: null, stopAfter: 3 },
  { name: '1.2', years: null, offices: null, projects: PROJECTS },
  { name: '1.3', years: null, offices: OFFICES, projects: null },
  { name: '1.4', years: null, offices: OFFICES, projects: PROJECTS },
  { name: '1.5', years: Y2, offices: null, projects: null, stopAfter: 3 },
  { name: '1.6', years: Y2, offices: null, projects: PROJECTS },
  { name: '1.7', years: Y2, offices: OFFICES, projects: null },
  { name: '1.8', years: Y2, offices: OFFICES, projects: PROJECTS },
];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
for (const c of cases) {
  if (only && !only.includes(c.name)) continue;
  try {
    if (await panel.locator('#run-new').count()) await panel.locator('#run-new').click();
    await panel.locator('[data-filter]').first().waitFor();
    await pickYears(c.years ?? []);
    await pickOffices(c.offices ?? []);
    await pickProjects(c.projects ?? []);
    await panel.locator('#start').click();
    await panel.locator('#plan-count').waitFor({ timeout: 60000 });
    const plan = `${await panel.locator('#plan-count').textContent()} | ${await panel.locator('#plan-sizes').textContent()}`;
    await panel.locator('input[data-rows="nonzero"]').check();
    const agree = panel.locator('#plan-agree');
    if (await panel.locator('#plan-agree-line').isVisible()) await agree.check();
    await panel.locator('#run-start').click();
    const t0 = Date.now();
    if (c.stopAfter) {
      while (Date.now() - t0 < 120000) {
        const s = await runRows();
        if (s.reportsDone >= c.stopAfter) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      await panel.locator('#run-stop').click();
    }
    while (Date.now() - t0 < 15 * 60000) {
      const s = await runRows();
      if (s.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    const s = await runRows();
    const text = (await runText()).replace(/\s+/g, ' ').slice(0, 160);
    log(`${c.name} plan [${plan}] -> ${JSON.stringify(s)} | ${Math.round((Date.now() - t0) / 1000)} s | panel: ${text}`);
  } catch (err) {
    log(`${c.name} FAILED: ${String(err.message).split('\n')[0]} | panel: ${(await runText()).replace(/\s+/g, ' ').slice(0, 200)}`);
    await panel.keyboard.press('Escape').catch(() => {});
  }
}
log(`end ${new Date().toISOString()}`);
await browser.close().catch(() => {});
