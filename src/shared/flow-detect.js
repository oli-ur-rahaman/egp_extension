// Which report page is this tab on? Compares the address with the Site Profile.

/**
 * @param {any} profile
 * @param {string} url
 * @returns {string | null} the flow's ID, or null for any other page
 */
export function detectFlow(profile, url) {
  /** @type {URL} */
  let here;
  try {
    here = new URL(url);
  } catch {
    return null;
  }
  if (here.hostname !== new URL(profile.site.baseUrl).hostname) return null;
  for (const [id, flow] of Object.entries(/** @type {Record<string, any>} */ (profile.flows))) {
    const want = new URL(flow.page.url, profile.site.baseUrl);
    if (want.pathname !== here.pathname) continue;
    if ([...want.searchParams].every(([k, v]) => here.searchParams.get(k) === v)) return id;
  }
  return null;
}

/** @param {any} profile @param {string} url */
export function isPortal(profile, url) {
  try {
    return new URL(url).hostname === new URL(profile.site.baseUrl).hostname;
  } catch {
    return false;
  }
}
