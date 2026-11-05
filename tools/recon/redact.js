// Redaction for recon captures. Runs before anything is written to disk.
// The rule: no password, token, cookie value or auth header ever reaches recon/raw/.

/** Field names that may carry a secret. Matched against name, id and autocomplete. */
export const SENSITIVE_NAME = /pass|pwd|token|secret|otp|captcha|csrf|xsrf|auth|session|cookie|pin\b|email|mobile|\bnid\b/i;

export const REDACTED = '[REDACTED]';

/** Login and account pages are never recorded, whatever their contents. */
const PRIVATE_URL = /login|logout|password|updatemobile|inboxmessage|composemail|viewtaskdetails|\/admin\//i;

/** @param {string} url */
export function isPrivateUrl(url) {
  return PRIVATE_URL.test(url);
}

const SENSITIVE_HEADERS = new Set(['cookie', 'set-cookie', 'authorization', 'proxy-authorization', 'x-csrf-token', 'x-xsrf-token']);

/**
 * Snapshot the current page with secrets removed. Runs INSIDE the page via CDP
 * Runtime.evaluate, so it must be self-contained: no references to module scope.
 * The live page is never modified; redaction happens on a clone.
 * @param {Document} [doc]
 */
export function snapshotPage(doc = document) {
  const sensitive = /pass|pwd|token|secret|otp|captcha|csrf|xsrf|auth|session|cookie|pin\b|email|mobile|\bnid\b/i;
  const redacted = '[REDACTED]';
  /** @param {Element} el */
  const isSensitive = (el) => {
    const type = (el.getAttribute('type') || '').toLowerCase();
    const key = [el.getAttribute('name'), el.getAttribute('id'), el.getAttribute('autocomplete')].join(' ');
    return type === 'password' || sensitive.test(key);
  };
  /** @param {Element} el */
  const labelOf = (el) => {
    const id = el.getAttribute('id');
    const forLabel = id ? doc.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    if (forLabel) return (forLabel.textContent || '').trim();
    const wrap = el.closest('label');
    if (wrap) return (wrap.textContent || '').trim().slice(0, 80);
    const cell = el.closest('td');
    const prev = cell && cell.previousElementSibling;
    return prev ? (prev.textContent || '').trim().slice(0, 80) : '';
  };

  // Structured summary, read from the live page (values of sensitive fields skipped).
  const selects = [...doc.querySelectorAll('select')].map((s) => ({
    id: s.id, name: s.getAttribute('name'), label: labelOf(s),
    multiple: s.multiple, disabled: s.disabled, onchange: s.getAttribute('onchange'),
    options: [...s.options].map((o) => ({ value: o.value, text: (o.textContent || '').trim(), selected: o.selected })),
  }));
  const inputs = [...doc.querySelectorAll('input, textarea, button')].map((el) => ({
    tag: el.tagName.toLowerCase(), type: el.getAttribute('type'), id: el.id, name: el.getAttribute('name'),
    label: labelOf(el), value: isSensitive(el) ? redacted : /** @type {HTMLInputElement} */ (el).value?.slice(0, 200),
    onclick: el.getAttribute('onclick'),
  }));
  const tables = [...doc.querySelectorAll('table')].map((t) => ({
    id: t.id, className: t.className, rows: t.rows.length,
    headers: [...t.querySelectorAll('tr:first-child th, thead th')].map((h) => (h.textContent || '').trim()),
  }));
  const links = [...doc.querySelectorAll('a[href]')].slice(0, 500).map((a) => ({
    text: (a.textContent || '').trim().slice(0, 80), href: a.getAttribute('href'), target: a.getAttribute('target'),
    onclick: a.getAttribute('onclick'),
  }));

  // Redacted HTML copy.
  const clone = /** @type {HTMLElement} */ (doc.documentElement.cloneNode(true));
  for (const el of clone.querySelectorAll('input, textarea')) {
    if (!isSensitive(el)) continue;
    if (el.hasAttribute('value')) el.setAttribute('value', redacted);
    if (el.tagName === 'TEXTAREA') el.textContent = redacted;
  }
  for (const meta of clone.querySelectorAll('meta[name], meta[http-equiv]')) {
    const key = `${meta.getAttribute('name') || ''} ${meta.getAttribute('http-equiv') || ''}`;
    if (sensitive.test(key) && meta.hasAttribute('content')) meta.setAttribute('content', redacted);
  }

  return {
    url: doc.location ? doc.location.href : '',
    title: doc.title,
    capturedAt: new Date().toISOString(),
    html: '<!doctype html>\n' + clone.outerHTML,
    selects, inputs, tables, links,
  };
}

/**
 * @param {Record<string, string> | undefined} headers
 * @returns {Record<string, string>}
 */
export function redactHeaders(headers) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
}

/**
 * Redact sensitive fields in a request body (form-encoded or JSON). Unknown formats are dropped.
 * @param {string | undefined} body
 * @param {string} [contentType]
 */
export function redactBody(body, contentType = '') {
  if (!body) return body;
  if (/json/i.test(contentType)) {
    try {
      return JSON.stringify(redactJson(JSON.parse(body)));
    } catch {
      return REDACTED;
    }
  }
  if (/x-www-form-urlencoded/i.test(contentType) || /^[^\s=&]+=[^\s]*(&|$)/.test(body)) {
    const params = new URLSearchParams(body);
    for (const key of [...params.keys()]) {
      if (SENSITIVE_NAME.test(key)) params.set(key, REDACTED);
    }
    return params.toString();
  }
  return `${REDACTED} (${body.length} bytes, unrecognised format)`;
}

/** @param {unknown} value @returns {unknown} */
function redactJson(value) {
  if (Array.isArray(value)) return value.map(redactJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE_NAME.test(k) ? REDACTED : redactJson(v)]));
  }
  return value;
}
