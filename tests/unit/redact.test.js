// @vitest-environment happy-dom
// M0-AT5: a password or token on a captured page never reaches disk.
import { beforeEach, describe, expect, it } from 'vitest';
import { REDACTED, redactBody, redactHeaders, snapshotPage } from '../../tools/recon/redact.js';

const SECRET = 'Hunter2-SuperSecret';
const TOKEN = 'tok-9f8e7d6c5b4a';

beforeEach(() => {
  document.title = 'Login';
  document.body.innerHTML = `
    <form id="loginForm">
      <label for="emailId">Email</label><input id="emailId" name="emailId" value="officer@example.gov.bd">
      <input type="password" id="pwd" name="password" value="${SECRET}">
      <input type="hidden" name="csrfToken" value="${TOKEN}">
      <input type="hidden" name="__VIEWSTATE" value="abc123">
      <textarea name="sessionNote">${SECRET}</textarea>
    </form>
    <table id="results"><tr><th>Tender ID</th><th>Title</th></tr><tr><td>1</td><td>Road</td></tr></table>
    <select id="ddlMinistry" name="ministry" onchange="__doPostBack('ministry','')">
      <option value="">-- Select --</option><option value="12" selected>Ministry of Works</option>
    </select>`;
  // A typed (not attribute) password value must not leak either.
  /** @type {HTMLInputElement} */ (document.getElementById('pwd')).value = SECRET;
});

describe('snapshotPage', () => {
  it('strips password, token and session values from the HTML and the summary', () => {
    const snap = snapshotPage(document);
    const everything = JSON.stringify(snap);
    expect(everything).not.toContain(SECRET);
    expect(everything).not.toContain(TOKEN);
    expect(snap.html).toContain(REDACTED);
  });

  it('keeps non-sensitive structure intact', () => {
    const snap = snapshotPage(document);
    expect(snap.html).toContain('__VIEWSTATE');
    expect(snap.selects[0]).toMatchObject({ id: 'ddlMinistry', name: 'ministry', onchange: "__doPostBack('ministry','')" });
    expect(snap.selects[0].options.map((o) => o.text)).toEqual(['-- Select --', 'Ministry of Works']);
    expect(snap.tables[0].headers).toEqual(['Tender ID', 'Title']);
    expect(snap.inputs.find((i) => i.name === 'emailId')?.label).toBe('Email');
  });

  it('does not modify the live page', () => {
    snapshotPage(document);
    expect(/** @type {HTMLInputElement} */ (document.getElementById('pwd')).value).toBe(SECRET);
  });

  it('is self-contained so it can run inside the page via CDP', () => {
    const fn = new Function(`return (${snapshotPage.toString()})(document)`);
    expect(JSON.stringify(fn())).not.toContain(SECRET);
  });
});

describe('network redaction', () => {
  it('redacts cookie and auth headers in any case', () => {
    const out = redactHeaders({ Cookie: 'JSESSIONID=abc', 'Set-Cookie': 'x=1', Authorization: 'Bearer z', Accept: 'text/html' });
    expect(out).toEqual({ Cookie: REDACTED, 'Set-Cookie': REDACTED, Authorization: REDACTED, Accept: 'text/html' });
  });

  it('redacts sensitive form fields and keeps filter fields', () => {
    const out = redactBody(`emailId=a%40b.c&password=${SECRET}&ministry=12&__RequestVerificationToken=${TOKEN}`, 'application/x-www-form-urlencoded');
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain(TOKEN);
    expect(out).toContain('ministry=12');
  });

  it('redacts nested JSON keys', () => {
    const out = redactBody(JSON.stringify({ user: { pwd: SECRET }, filters: [{ ministry: 12 }] }), 'application/json');
    expect(out).not.toContain(SECRET);
    expect(out).toContain('"ministry":12');
  });

  it('drops bodies it cannot parse', () => {
    expect(redactBody(`--boundary\r\n${SECRET}`, 'multipart/form-data')).not.toContain(SECRET);
  });
});
