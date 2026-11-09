// @ts-nocheck: works on the profile's free-form JSON. Covered by tests/unit/report-plan.test.js.
// Flow 1 (D65, D68): which reports a run makes. One report per financial year × office × project.
// Year and office default to All and loop; project defaults to Not set, one report with no project.

/** Bangladesh's fiscal year runs July to June: 1 July 2025 to 30 June 2026 is 2025-2026. @param {Date} now */
export function currentFiscalYear(now) {
  const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return { start, end: start + 1, text: `${start}-${start + 1}` };
}

const yearOf = (text) => {
  const m = /^(\d{4})\s*-\s*(\d{4})$/.exec((text ?? '').trim());
  return m ? { start: Number(m[1]), end: Number(m[2]) } : null;
};

/** Filters a Flow 1 run loops over, in the profile's order: years and offices (All by default), projects (Not set by default). */
export const loopFilters = (flow) => flow.filters.filter((f) => f.allMeansLoop || f.multiPick);

/**
 * @param {any} flow
 * @param {{ fields: Record<string, string>, loops: Record<string, { field: string, mirror?: string, options: { value: string, text: string }[], selected: { value: string, text: string } | null }> }} built
 * @param {Record<string, boolean | string[]>} wanted true: All; a list: those; false: what the page has (or Not set, for a project)
 * @param {Date} now
 */
export function reportCombos(flow, built, wanted, now) {
  const current = currentFiscalYear(now);
  /** @type {{ key: string, fields: Record<string, string>, labels: Record<string, string> }[]} */
  let combos = [{ key: '', fields: {}, labels: {} }];
  const sizes = {};
  // With projects chosen, "all offices" is one report per project: the portal gives a project's figures with office 0 (live, D68).
  const projectsChosen = flow.filters.some((f) => f.multiPick && Array.isArray(wanted[f.id]) && wanted[f.id].length);
  for (const filter of loopFilters(flow)) {
    const loop = built.loops[filter.id];
    if (!loop) continue;
    const want = wanted[filter.id];
    let options;
    if (filter.multiPick) options = Array.isArray(want) && want.length ? loop.options.filter((o) => want.includes(o.value)) : [{ value: filter.empty ?? '', text: '' }];
    else if (Array.isArray(want)) options = loop.options.filter((o) => want.includes(o.value));
    else if (want && projectsChosen && filter.allWithProject) options = [{ value: filter.allWithProject.value, text: filter.allWithProject.label }];
    else if (want) options = loop.options;
    else options = loop.selected ? [loop.selected] : [];
    // A year after the current one can't have data yet.
    if (filter.loopFields && want === true) options = options.filter((o) => (yearOf(o.text)?.start ?? 0) <= current.start);
    sizes[filter.id] = filter.multiPick && !(Array.isArray(want) && want.length) ? 0 : options.length;
    const next = [];
    for (const combo of combos) {
      for (const option of options) {
        const fields = { ...combo.fields, [loop.field]: option.value };
        if (loop.mirror) fields[loop.mirror] = option.text;
        const year = yearOf(option.text);
        for (const [field, template] of Object.entries(filter.loopFields ?? {})) {
          if (year) fields[field] = template.replace('{start}', String(year.start)).replace('{end}', String(year.end));
        }
        const labels = option.text ? { ...combo.labels, [filter.id]: option.text } : combo.labels;
        next.push({ key: `${combo.key}${combo.key ? '|' : ''}${option.value}`, fields, labels });
      }
    }
    combos = next;
  }
  return { combos, sizes, currentYear: current.text };
}
