// Makes a zip of the built extension to hand to a user (for example by WhatsApp): release/PDMS_v<version>.zip.
// Builds first, leaves out source maps, and puts a short install guide beside the extension's files.
//   npm run package
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
/** @param {string} cmd */
const run = (cmd) => spawnSync(cmd, { cwd: root, shell: true, stdio: 'inherit' });

if (run('npm run build').status !== 0) {
  console.error('The build did not work: nothing was packaged.');
  process.exit(1);
}
const { version } = JSON.parse(readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
const name = `PDMS_v${version}`;
const release = path.join(root, 'release');
const stage = path.join(release, name);
const zip = path.join(release, `${name}.zip`);
rmSync(stage, { recursive: true, force: true });
rmSync(zip, { force: true });
mkdirSync(stage, { recursive: true });
cpSync(dist, stage, { recursive: true, filter: (src) => !src.endsWith('.map') });

writeFileSync(path.join(stage, 'HOW TO INSTALL.txt'), `Procurement Data Management System (PDMS) ${version}
A Chrome extension that collects report data from e-GP (eprocure.gov.bd) into Excel.

INSTALL (once)
1. Unzip this file into a folder you will keep, for example Documents\\PDMS.
   Chrome runs PDMS from that folder, so don't delete or move it afterwards.
2. In Chrome, open the address  chrome://extensions
3. Turn on "Developer mode" (top right).
4. Press "Load unpacked" and choose the folder that holds this file (it also holds manifest.json).
5. PDMS appears as a card. Press the puzzle-piece icon on Chrome's toolbar and pin PDMS.

USE
- Open e-GP, go to one of its report or search pages, and press the PDMS icon. The PDMS panel opens beside the page.
- Choose the filters in the panel, press Start, and download the Excel file at the end.

UPDATE (when you get a newer zip)
1. Unzip the new version over the same folder, replacing the old files.
2. In chrome://extensions, press the round reload arrow on the PDMS card. The card shows the new version number.

GOOD TO KNOW
- Chrome may say that developer-mode extensions are on. That is expected: PDMS is installed privately, not from the Chrome Web Store.
- Everything PDMS collects stays on this PC. It sends nothing anywhere except the e-GP pages it reads for you.
- PDMS never reads or keeps your e-GP password. You log in to e-GP yourself.
`.replace(/\n/g, '\r\n'));

const zipped = process.platform === 'win32'
  ? run(`powershell -NoProfile -Command "Compress-Archive -Path '${stage}' -DestinationPath '${zip}'"`)
  : run(`cd "${release}" && zip -qr "${name}.zip" "${name}"`);
if (zipped.status !== 0 || !existsSync(zip)) {
  console.error('Zipping did not work.');
  process.exit(1);
}
rmSync(stage, { recursive: true, force: true });
console.log(`\nReady to share: ${zip} (${Math.round(statSync(zip).size / 1024)} KB)`);
