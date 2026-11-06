// @ts-nocheck
// Analyses recon/raw/study/samples.jsonl: layouts per flow, and which attributes separate them. Labels only.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = path.join(root, 'recon', 'raw', 'study', process.argv[2] || 'logged-out');
const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const samples = lines(path.join(dir, 'samples.jsonl'));
const strata = lines(path.join(dir, 'strata-done.jsonl'));

const norm = (l) => l.replace(/\s+/g, ' ').trim();
const entropy = (counts) => { const n = counts.reduce((a, b) => a + b, 0); return -counts.reduce((e, c) => (c ? e + (c / n) * Math.log2(c / n) : e), 0); };

for (const flow of ['2', '3', '4', '5']) {
  const S = samples.filter((s) => s.flow === flow);
  if (!S.length) continue;
  const fp = (s) => [...new Set(s.visible.map(norm))].sort().join('|') + ' ## ' + [...new Set(s.tableHeaders.map(norm))].sort().join('|');
  const groups = new Map();
  for (const s of S) { const k = fp(s); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const name = new Map(ordered.map(([k], i) => [k, 'L' + (i + 1)]));
  console.log(`\n===== FLOW ${flow}: ${S.length} pages, ${ordered.length} distinct label sets; titles: ${[...new Set(S.map((s) => s.title))].join(' | ')}`);
  const st = strata.filter((x) => x.flow === flow);
  console.log('strata', st.length, '| empty:', st.filter((x) => !x.totalPages).map((x) => x.stratum).join(', ') || 'none');

  // Label frequency: always present, sometimes present.
  const freq = new Map();
  for (const s of S) for (const l of new Set([...s.visible, ...s.tableHeaders].map(norm))) freq.set(l, (freq.get(l) || 0) + 1);
  const all = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  console.log('labels total', all.length, '| on every page', all.filter(([, c]) => c === S.length).length);

  // Which attribute best predicts each sometimes-present label.
  const attrs = [...new Set(S.flatMap((s) => Object.keys(s.attrs)))];
  const ig = [];
  for (const a of attrs) {
    const vals = new Map();
    for (const s of S) { const v = String(s.attrs[a] ?? '?'); if (!vals.has(v)) vals.set(v, []); vals.get(v).push(name.get(fp(s))); }
    const tally = (arr) => { const t = {}; for (const x of arr) t[x] = (t[x] || 0) + 1; return Object.values(t); };
    const H = entropy(tally(S.map((s) => name.get(fp(s)))));
    let cond = 0;
    for (const arr of vals.values()) cond += (arr.length / S.length) * entropy(tally(arr));
    ig.push([a, H ? (H - cond) / H : 0, vals]);
  }
  ig.sort((x, y) => y[1] - x[1]);
  console.log('how much of the layout variety each attribute explains (0 none, 1 all):');
  for (const [a, g, vals] of ig) console.log(`  ${a.padEnd(12)} ${g.toFixed(2)}  (${vals.size} values)`);

  // Sometimes-present labels, with the attribute value where they concentrate.
  const best = ig[0];
  console.log('sometimes-present labels (count) and where they occur:');
  for (const [l, c] of all.filter(([, c]) => c < S.length).slice(0, 70)) {
    const by = {};
    for (const s of S) { const has = [...s.visible, ...s.tableHeaders].map(norm).includes(l); const v = String(s.attrs[best[0]] ?? '?'); by[v] = by[v] || [0, 0]; by[v][0] += has ? 1 : 0; by[v][1]++; }
    const where = Object.entries(by).filter(([, x]) => x[0]).sort((p, q) => q[1][0] / q[1][1] - p[1][0] / p[1][1]).slice(0, 5).map(([v, x]) => `${v.slice(0, 22)} ${x[0]}/${x[1]}`).join(', ');
    console.log(`  ${String(c).padStart(4)}  ${l.slice(0, 52).padEnd(52)} ${where}`);
  }
  console.log('top layouts:');
  for (const [k, g] of ordered.slice(0, 8)) {
    const tally = (a) => { const t = {}; for (const s of g) { const v = String(s.attrs[a] ?? '?'); t[v] = (t[v] || 0) + 1; } return Object.entries(t).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([v, c]) => `${v.slice(0, 18)}:${c}`).join(' '); };
    console.log(`  ${name.get(k)} n=${g.length} labels=${g[0].visible.length} | ` + attrs.map((a) => `${a}[${tally(a)}]`).join(' '));
  }
  console.log('hidden labels:', [...new Set(S.flatMap((s) => s.hidden.map(norm)))].slice(0, 20).join(' ; ') || 'none');
}
