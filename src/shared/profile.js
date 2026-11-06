// Loads the Site Profile: three layers merged, then checked. Holds no portal knowledge itself.
// Layers, lowest priority first: shipped file, override (Dev mode repairs), session (one run). PROJECT_PLAN §3.2.

/** A profile that fails its checks. `problems` names every fault, so a repair needs one pass. */
export class ProfileError extends Error {
  /** @param {string[]} problems */
  constructor(problems) {
    super(`Site Profile is not usable:\n${problems.join('\n')}`);
    this.name = 'ProfileError';
    this.problems = problems;
  }
}

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Arrays of objects with an `id` merge entry by entry, so a repair can patch one filter or field. @param {any} a @param {any} b */
function mergeValue(a, b) {
  if (isObject(a) && isObject(b)) return mergeLayers(a, b);
  const byId = (/** @type {any} */ arr) => Array.isArray(arr) && arr.length > 0 && arr.every((x) => isObject(x) && typeof x.id === 'string');
  if (byId(a) && byId(b)) {
    const out = a.map((/** @type {any} */ x) => {
      const patch = b.find((/** @type {any} */ y) => y.id === x.id);
      return patch ? mergeLayers(x, patch) : x;
    });
    for (const y of b) if (!a.some((/** @type {any} */ x) => x.id === y.id)) out.push(y);
    return out;
  }
  return b;
}

/**
 * Merges layers in order; later layers win. Inputs are not changed. A null layer is skipped.
 * @param {...(Record<string, any> | null | undefined)} layers
 * @returns {Record<string, any>}
 */
export function mergeLayers(...layers) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) out[k] = k in out ? mergeValue(out[k], v) : v;
  }
  return out;
}

/** @param {any} v @param {string} t */
function isType(v, t) {
  if (t === 'array') return Array.isArray(v);
  if (t === 'object') return isObject(v);
  if (t === 'integer') return Number.isInteger(v);
  return typeof v === t;
}

/**
 * Checks a value against the subset of JSON Schema that profiles/schema.json uses.
 * Own code, because the extension's security policy forbids the generated code schema libraries rely on.
 * @param {any} value
 * @param {any} schema
 * @param {any} [root]
 * @param {string} [where]
 * @returns {string[]}
 */
export function checkSchema(value, schema, root = schema, where = '$') {
  if (schema.$ref) {
    const name = schema.$ref.replace('#/$defs/', '');
    return checkSchema(value, root.$defs[name], root, where);
  }
  /** @type {string[]} */
  const problems = [];
  if (schema.type) {
    const types = [schema.type].flat();
    if (!types.some((t) => isType(value, t))) return [`${where}: expected ${types.join(' or ')}`];
  }
  if (schema.enum && !schema.enum.includes(value)) problems.push(`${where}: "${value}" is not one of ${schema.enum.join(', ')}`);
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) problems.push(`${where}: "${value}" doesn't match ${schema.pattern}`);
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) problems.push(`${where}: below ${schema.minimum}`);
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) problems.push(`${where}: needs at least ${schema.minItems} items`);
    if (schema.items) value.forEach((v, i) => problems.push(...checkSchema(v, schema.items, root, `${where}[${i}]`)));
  }
  if (isObject(value)) {
    for (const k of schema.required ?? []) if (!(k in value)) problems.push(`${where}: missing "${k}"`);
    const props = schema.properties ?? {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) problems.push(...checkSchema(v, props[k], root, `${where}.${k}`));
      else if (schema.additionalProperties === false) problems.push(`${where}: unknown property "${k}"`);
      else if (isObject(schema.additionalProperties)) problems.push(...checkSchema(v, schema.additionalProperties, root, `${where}.${k}`));
    }
  }
  return problems;
}

/** A label as compared: single spaces, no trailing colon. @param {string} label */
export const normaliseLabel = (label) => label.replace(/\s+/g, ' ').trim().replace(/\s*:$/, '');

/**
 * Reads a detail-page label against a flow's fields.
 * Returns the field, or an `ignored` entry, or null for a label the tool has never seen (reported, never fatal).
 * @param {any} flow
 * @param {string} rawLabel
 * @returns {{ field: any } | { ignored: any } | null}
 */
export function classifyLabel(flow, rawLabel) {
  const label = normaliseLabel(rawLabel);
  const detail = flow.detail;
  if (!detail) return null;
  for (const field of detail.fields) {
    if (field.labels.some((/** @type {string} */ l) => normaliseLabel(l) === label)) return { field };
    if ((field.labelPatterns ?? []).some((/** @type {string} */ p) => new RegExp(p).test(label))) return { field };
  }
  for (const ignored of detail.ignored) {
    if (ignored.labels.some((/** @type {string} */ l) => normaliseLabel(l) === label)) return { ignored };
  }
  return null;
}

/** @param {any[]} items @param {string} what @param {string} where */
function duplicates(items, what, where) {
  const seen = new Set();
  /** @type {string[]} */
  const problems = [];
  for (const it of items) {
    if (seen.has(it)) problems.push(`${where}: duplicate ${what} "${it}"`);
    seen.add(it);
  }
  return problems;
}

/**
 * Checks what a schema can't: references between parts of the profile, and the D32 cluster count.
 * @param {any} profile
 * @returns {string[]}
 */
export function checkConsistency(profile) {
  /** @type {string[]} */
  const problems = [];
  for (const [flowId, flow] of Object.entries(/** @type {Record<string, any>} */ (profile.flows ?? {}))) {
    const filterIds = flow.filters.map((/** @type {any} */ f) => f.id);
    problems.push(...duplicates(filterIds, 'filter', flowId));
    const hasFilter = (/** @type {string} */ id, /** @type {string} */ from) => {
      if (!filterIds.includes(id)) problems.push(`${flowId}: ${from} names filter "${id}", which doesn't exist`);
    };
    for (const f of flow.filters) {
      for (const d of f.dependsOn ?? []) hasFilter(d, `${f.id}.dependsOn`);
      if (f.source && !profile.sharedSources?.[f.source]) problems.push(`${flowId}: ${f.id}.source "${f.source}" doesn't exist`);
      if (!f.selector && !f.parts) problems.push(`${flowId}: ${f.id} has neither a selector nor parts`);
      if (!f.requestField && !f.parts && f.control !== 'tree') problems.push(`${flowId}: ${f.id} has no request field`);
    }
    for (const r of flow.rules.required) hasFilter(r, 'rules.required');
    if (flow.rules.window) hasFilter(flow.rules.window.filter, 'rules.window');
    for (const e of flow.rules.exemptions ?? []) {
      for (const a of e.anyOf) hasFilter(a, 'exemption.anyOf');
      for (const l of e.lifts) hasFilter(l, 'exemption.lifts');
    }

    if (flow.pattern === 'report' && !flow.report) problems.push(`${flowId}: a report flow needs "report"`);
    if (flow.pattern === 'listDetail') {
      if (!flow.list) problems.push(`${flowId}: a list flow needs "list"`);
      if (!flow.detail) problems.push(`${flowId}: a list flow needs "detail"`);
      if (!flow.naturalKey) problems.push(`${flowId}: a list flow needs "naturalKey"`);
    }
    const listKeys = (flow.list?.columns ?? []).flatMap((/** @type {any} */ c) => c.parts.map((/** @type {any} */ p) => p.key));
    problems.push(...duplicates(listKeys, 'list key', flowId));
    for (const key of [flow.naturalKey?.key, flow.naturalKey?.fallback]) {
      if (key && !listKeys.includes(key)) problems.push(`${flowId}: naturalKey "${key}" isn't a list key`);
    }

    if (flow.detail) {
      const clusterIds = flow.detail.clusters.map((/** @type {any} */ c) => c.id);
      problems.push(...duplicates(clusterIds, 'cluster', flowId));
      if (clusterIds.length < 5 || clusterIds.length > 6) problems.push(`${flowId}: has ${clusterIds.length} clusters; D32 says 5 or 6`);
      const fields = flow.detail.fields;
      problems.push(...duplicates(fields.map((/** @type {any} */ f) => f.id), 'field', flowId));
      for (const c of clusterIds) {
        if (!fields.some((/** @type {any} */ f) => f.cluster === c)) problems.push(`${flowId}: cluster "${c}" has no fields`);
      }
      /** @type {Map<string, string>} */
      const owner = new Map();
      for (const f of fields) {
        if (!clusterIds.includes(f.cluster)) problems.push(`${flowId}: field "${f.id}" is in unknown cluster "${f.cluster}"`);
        if (f.sameAs && !listKeys.includes(f.sameAs)) problems.push(`${flowId}: field "${f.id}" sameAs "${f.sameAs}" isn't a list key`);
        for (const l of f.labels.map(normaliseLabel)) {
          if (owner.has(l)) problems.push(`${flowId}: label "${l}" belongs to both "${owner.get(l)}" and "${f.id}"`);
          owner.set(l, f.id);
        }
        for (const p of f.labelPatterns ?? []) {
          try {
            new RegExp(p);
          } catch {
            problems.push(`${flowId}: field "${f.id}" has a bad pattern "${p}"`);
          }
        }
      }
      for (const g of flow.detail.ignored) {
        for (const l of g.labels.map(normaliseLabel)) {
          if (owner.has(l)) problems.push(`${flowId}: label "${l}" is both field "${owner.get(l)}" and ignored`);
        }
      }
    }
  }
  return problems;
}

/**
 * Merges and checks. Throws ProfileError listing every problem.
 * @param {{ shipped: Record<string, any>, schema: any, override?: Record<string, any> | null, session?: Record<string, any> | null }} input
 * @returns {Record<string, any>}
 */
export function buildProfile({ shipped, schema, override = null, session = null }) {
  const merged = mergeLayers(shipped, override, session);
  const problems = checkSchema(merged, schema);
  if (problems.length === 0) problems.push(...checkConsistency(merged));
  if (problems.length > 0) throw new ProfileError(problems);
  return merged;
}

/**
 * Reads the shipped files from the extension and builds the profile.
 * @param {{ override?: Record<string, any> | null, session?: Record<string, any> | null, readJson?: (file: string) => Promise<any> }} [options]
 * @returns {Promise<Record<string, any>>}
 */
export async function loadProfile({ override = null, session = null, readJson = readPackagedJson } = {}) {
  const current = await readJson('profiles/current.json');
  const [shipped, schema] = await Promise.all([readJson(`profiles/${current.profile}`), readJson(`profiles/${current.schema}`)]);
  return buildProfile({ shipped, schema, override, session });
}

/** @param {string} file */
async function readPackagedJson(file) {
  const response = await fetch(chrome.runtime.getURL(file));
  if (!response.ok) throw new Error(`Can't read ${file}: HTTP ${response.status}`);
  return response.json();
}
