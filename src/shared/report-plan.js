// @ts-nocheck: works on the profile's free-form JSON. Covered by tests/unit/report-plan.test.js.
// Flow 1 (D65): which reports a run makes. Each filter set to All is looped, and the reports are every combination.

/** Bangladesh's fiscal year runs July to June: 1 July 2025 to 30 June 2026 is 2025-2026. @param {Date} now */
export function currentFiscalYear(now) {
  const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return { start, end: start + 1, text: `${start}-${start + 1}` };
}

const yearOf = (text) => {
  const m = /^(\d{4})\s*-\s*(\d{4})$/.exec((text ?? '').trim());
  return m ? { start: Number(m[1]), end: Number(m[2]) } : null;
};

/**
 * @param {any} flow
 * @param {{ fields: Record<string, string>, shown: any[], loops: Record<string, { field: string, mirror?: string, options: { value: string, text: string }[], selected: { value: string, text: string } | null }> }} built
 * @param {Record<string, boolean>} wanted which loop filters the user left on All
 * @param {Date} now
 */
export function reportCombos(flow, built, wanted, now) {
  const current = currentFiscalYear(now);
  /** @type {{ key: string, fields: Record<string, string>, labels: Record<string, string> }[]} */
  let combos = [{ key: '', fields: {}, labels: {} }];
  const sizes = {};
  for (const filter of flow.filters.filter((f) => f.allMeansLoop)) {
    const loop = built.loops[filter.id];
    if (!loop) continue;
    let options = wanted[filter.id] ? loop.options : loop.selected ? [loop.selected] : [];
    // A year after the current one can't have data yet.
    if (filter.loopFields && wanted[filter.id]) options = options.filter((o) => (yearOf(o.text)?.start ?? 0) <= current.start);
    sizes[filter.id] = options.length;
    const next = [];
    for (const combo of combos) {
      for (const option of options) {
        const fields = { ...combo.fields, [loop.field]: option.value };
        if (loop.mirror) fields[loop.mirror] = option.text;
        const year = yearOf(option.text);
        for (const [field, template] of Object.entries(filter.loopFields ?? {})) {
          if (year) fields[field] = template.replace('{start}', String(year.start)).replace('{end}', String(year.end));
        }
        next.push({ key: `${combo.key}${combo.key ? '|' : ''}${option.value}`, fields, labels: { ...combo.labels, [filter.id]: option.text } });
      }
    }
    combos = next;
  }
  return { combos, sizes, currentYear: current.text };
}
