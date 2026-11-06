// M1-T10: a page's structure as a short code. Values don't affect it, and neither does the number of rows, so it only moves
// when the portal's layout does. Pure DOM and arithmetic, so it runs in a test or in the extension.

/** @param {Element} el */
function shape(el) {
  const classes = (el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean).sort().join('.');
  const own = el.tagName.toLowerCase() + (classes ? `.${classes}` : '');
  /** @type {string[]} */
  const children = [];
  for (const child of el.children) {
    const s = shape(child);
    // Repeated rows collapse, so 10 rows and 100 have one fingerprint. Cells within a row don't, so a lost column shows.
    if (el.tagName === 'TR' || children[children.length - 1] !== s) children.push(s);
  }
  return children.length ? `${own}(${children.join(',')})` : own;
}

/** FNV-1a, as eight hex digits. @param {string} text */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * @param {Element} root the page's body, or the element holding a fragment
 * @returns {string}
 */
export function fingerprint(root) {
  return hash(shape(root));
}
