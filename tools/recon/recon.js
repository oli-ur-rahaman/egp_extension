// Recon harness: read-only observation of the debug Chrome over CDP.
// You drive the browser; this only reads. Output goes to the git-ignored recon/raw/.
//
//   npm run recon -- ping                         confirm the link (R0)
//   npm run recon -- tabs                         list open tabs
//   npm run recon -- snapshot <label> [--tab N]   save redacted HTML + filter/table summary + screenshot
//   npm run recon -- watch <label> [--seconds 60] [--tab N]
//                                                 record network traffic while you click
// Options: --port 9222 (default), --tab <index from `tabs`> (default: first e-GP tab, else first tab)

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserVersion, connect, listPages } from './cdp.js';
import { redactBody, redactHeaders, snapshotPage } from './redact.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rawDir = path.join(root, 'recon', 'raw');

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {{ _: string[], [k: string]: any }} */
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else out._.push(a);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const port = Number(args.port ?? 9222);
const [command, label] = args._;

/** @param {string} name */
function safeLabel(name) {
  return (name || 'capture').replace(/[^\w.-]+/g, '-').slice(0, 60);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function pickTab() {
  const pages = await listPages(port);
  if (pages.length === 0) throw new Error('No open tabs in the debug Chrome.');
  if (args.tab !== undefined) {
    const t = pages[Number(args.tab)];
    if (!t) throw new Error(`No tab at index ${args.tab}. Run: npm run recon -- tabs`);
    return t;
  }
  return pages.find((p) => /eprocure/i.test(p.url)) ?? pages[0];
}

async function cmdPing() {
  const v = await browserVersion(port);
  console.log(`Linked to ${v.Browser} on port ${port} (protocol ${v['Protocol-Version']}).`);
  const pages = await listPages(port);
  console.log(`${pages.length} tab(s) open.`);
}

async function cmdTabs() {
  const pages = await listPages(port);
  pages.forEach((p, i) => console.log(`[${i}] ${p.title}\n    ${p.url}`));
}

async function cmdSnapshot() {
  const tab = await pickTab();
  const cdp = connect(tab.webSocketDebuggerUrl);
  await cdp.opened;
  try {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
      expression: `(${snapshotPage.toString()})(document)`,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(`snapshot failed in page: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
    const snap = result.value;
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });

    const dir = path.join(rawDir, `${stamp()}-${safeLabel(label)}`);
    await mkdir(dir, { recursive: true });
    const { html, ...summary } = snap;
    await writeFile(path.join(dir, 'page.html'), html);
    await writeFile(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
    await writeFile(path.join(dir, 'screenshot.png'), Buffer.from(shot.data, 'base64'));

    console.log(`Saved ${path.relative(root, dir)}`);
    console.log(`  ${snap.title} — ${snap.url}`);
    console.log(`  ${snap.selects.length} select(s), ${snap.inputs.length} input/button(s), ${snap.tables.length} table(s), ${snap.links.length} link(s)`);
    for (const s of snap.selects) {
      console.log(`  select ${s.id || s.name || '?'} "${s.label}" — ${s.options.length} options${s.onchange ? ' (onchange)' : ''}`);
    }
  } finally {
    cdp.close();
  }
}

async function cmdWatch() {
  const seconds = Number(args.seconds ?? 60);
  const tab = await pickTab();
  const cdp = connect(tab.webSocketDebuggerUrl);
  await cdp.opened;

  /** @type {Map<string, any>} */
  const requests = new Map();
  const t0 = Date.now();

  cdp.on('Network.requestWillBeSent', (p) => {
    const ct = p.request.headers['Content-Type'] ?? p.request.headers['content-type'] ?? '';
    requests.set(p.requestId, {
      atMs: Date.now() - t0,
      method: p.request.method,
      url: p.request.url,
      type: p.type,
      requestHeaders: redactHeaders(p.request.headers),
      postData: redactBody(p.request.postData, ct),
    });
  });
  cdp.on('Network.responseReceived', (p) => {
    const r = requests.get(p.requestId);
    if (!r) return;
    Object.assign(r, {
      status: p.response.status,
      mimeType: p.response.mimeType,
      responseHeaders: redactHeaders(p.response.headers),
      timing: p.response.timing ? { sendStart: p.response.timing.sendStart, receiveHeadersEnd: p.response.timing.receiveHeadersEnd } : null,
    });
  });
  cdp.on('Network.loadingFinished', async (p) => {
    const r = requests.get(p.requestId);
    if (!r) return;
    r.durationMs = Date.now() - t0 - r.atMs;
    // Keep bodies of documents and XHR/fetch only; these show what Search returns.
    if (['Document', 'XHR', 'Fetch'].includes(r.type)) {
      try {
        const body = await cdp.send('Network.getResponseBody', { requestId: p.requestId });
        r.responseBody = body.base64Encoded ? `[base64, ${body.body.length} chars]` : String(body.body).slice(0, 200_000);
      } catch {
        r.responseBody = '[unavailable]';
      }
    }
  });

  const dir = path.join(rawDir, `${stamp()}-${safeLabel(label)}`);
  await mkdir(dir, { recursive: true });
  // Saved every 2 s, so the capture survives the process being stopped early.
  const save = () => writeFile(path.join(dir, 'network.json'), JSON.stringify([...requests.values()], null, 2));
  const timer = setInterval(save, 2000);

  await cdp.send('Network.enable');
  console.log(`Recording network on "${tab.title}" for ${seconds} s into ${path.relative(root, dir)}. Do the clicks now.`);
  // A dead link must be loud: without this, the file keeps being rewritten and looks healthy.
  const lost = await Promise.race([
    new Promise((resolve) => setTimeout(() => resolve(null), seconds * 1000)),
    cdp.closed,
  ]);
  if (lost) console.error(`LINK LOST after ${Math.round((Date.now() - t0) / 1000)} s (${lost}). Nothing after this point was recorded.`);
  clearInterval(timer);
  cdp.close();

  await save();
  const list = [...requests.values()];
  console.log(`Saved ${list.length} request(s) to ${path.relative(root, dir)}`);
  for (const r of list.filter((x) => ['Document', 'XHR', 'Fetch'].includes(x.type))) {
    console.log(`  ${r.method} ${r.status ?? '…'} ${r.type} ${r.durationMs ?? '?'}ms ${r.url.slice(0, 120)}`);
  }
}

const commands = { ping: cmdPing, tabs: cmdTabs, snapshot: cmdSnapshot, watch: cmdWatch };

const run = commands[/** @type {keyof typeof commands} */ (command)];
if (!run) {
  console.log('Usage: npm run recon -- <ping | tabs | snapshot <label> | watch <label> [--seconds N]> [--tab N] [--port 9222]');
  process.exit(command ? 1 : 0);
}
run().catch((err) => {
  if (err && err.cause && err.cause.code === 'ECONNREFUSED') {
    console.error(`No debug Chrome on port ${port}. Start it: powershell -ExecutionPolicy Bypass -File tools\\launch-chrome.ps1`);
  } else {
    console.error(err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
