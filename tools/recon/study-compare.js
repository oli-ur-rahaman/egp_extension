// @ts-nocheck
// Compares a logged-out and a logged-in run of tools/recon/study.js. Labels and counts only.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (state, file) => {
  const f = path.join(root, 'recon', 'raw', 'study', state, file);
  return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};
const O = { samples: read('logged-out', 'samples.jsonl'), strata: read('logged-out', 'strata-done.jsonl'), runs: read('logged-out', 'run.jsonl') };
const I = { samples: read('logged-in', 'samples.jsonl'), strata: read('logged-in', 'strata-done.jsonl'), runs: read('logged-in', 'run.jsonl') };
if (!O.strata.length || !I.strata.length) {
  console.log(`Need both runs on this PC. Logged-out filter values: ${O.strata.length}. Logged-in filter values: ${I.strata.length}.`);
  process.exit(0);
}
const dept = (r) => (r.runs.length ? r.runs[r.runs.length - 1].department : '') || '';
console.log(`Department: logged out "${dept(O)}", logged in "${dept(I)}".${dept(O) !== dept(I) ? ' NOT like for like: page counts reflect the department as well as the login.' : ''}`);
const labelSet = (s) => new Set([...s.visible, ...s.tableHeaders].map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean));
for (const flow of ['2', '3', '4', '5']) {
  console.log(`\n===== FLOW ${flow}`);
  const oMap = new Map(O.strata.filter((x) => x.flow === flow).map((x) => [x.stratum, x]));
  const iMap = new Map(I.strata.filter((x) => x.flow === flow).map((x) => [x.stratum, x]));
  for (const k of [...new Set([...oMap.keys(), ...iMap.keys()])]) {
    const a = oMap.get(k), b = iMap.get(k);
    const ta = a ? a.totalPages : '-', tb = b ? b.totalPages : '-';
    console.log(`  ${k.padEnd(38)} out ${String(ta).padStart(7)}  in ${String(tb).padStart(7)}${ta !== tb ? '  DIFFERENT' : ''}`);
  }
  const oL = new Set(O.samples.filter((s) => s.flow === flow).flatMap((s) => [...labelSet(s)]));
  const iL = new Set(I.samples.filter((s) => s.flow === flow).flatMap((s) => [...labelSet(s)]));
  console.log('  labels only logged in :', [...iL].filter((l) => !oL.has(l)).join(' ; ') || 'none');
  console.log('  labels only logged out:', [...oL].filter((l) => !iL.has(l)).join(' ; ') || 'none');
  // The same record seen both ways: the fairest test of whether a login changes a page.
  const oK = new Map(O.samples.filter((s) => s.flow === flow).map((s) => [s.key, s]));
  let same = 0, diff = 0;
  const diffs = new Set();
  for (const s of I.samples.filter((x) => x.flow === flow)) {
    const o = oK.get(s.key);
    if (!o) continue;
    const a = labelSet(o), b = labelSet(s);
    const d = [...a].filter((l) => !b.has(l)).concat([...b].filter((l) => !a.has(l)));
    if (d.length) { diff++; d.forEach((l) => diffs.add(l)); } else same++;
  }
  console.log(`  same record both ways: ${same} identical labels, ${diff} different${diffs.size ? ': ' + [...diffs].join(' ; ') : ''}`);
}
