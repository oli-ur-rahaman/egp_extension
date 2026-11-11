// Gets a PC ready, or up to date, in one go: run by setup.cmd (double-click). Safe to run any time.
// Checks Node, gets the latest from GitHub (never over unsaved work), installs only when the lockfile changed,
// builds, and says exactly what to do in Chrome. Each step says plainly what went wrong.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
// One command line through the shell: npm is npm.cmd on Windows, and this avoids PowerShell's script block.
/** @param {string} cmd @param {string[]} args @param {boolean} [quiet] */
const run = (cmd, args, quiet = false) => spawnSync([cmd, ...args].join(' '), { cwd: root, shell: true, stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
/** @param {string} text */
const say = (text) => console.log(`\n== ${text}`);
/** @param {string} text @returns {never} */
const fail = (text) => {
  console.log(`\nSTOPPED: ${text}`);
  process.exit(1);
};

say('1. Node.js');
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) fail(`Node.js ${process.versions.node} is too old. Install the LTS version (22 or later) from https://nodejs.org, then run setup.cmd again.`);
console.log(`Node.js ${process.versions.node}: ok`);

say('2. Latest from GitHub');
const changed = run('git', ['status', '--porcelain'], true).stdout.trim();
if (changed) {
  console.log('This PC has changes not yet saved to GitHub, so nothing was pulled (they would be at risk):');
  console.log(changed.split('\n').slice(0, 10).join('\n'));
  console.log('Ask Claude to commit and push them, then run setup.cmd again. Carrying on with the files as they are.');
} else {
  const pull = run('git', ['pull', '--ff-only']);
  if (pull.status !== 0) fail('git pull did not work. Check the internet connection; if it says the branches have diverged, ask Claude to sort it out.');
}

say('3. Packages');
const lock = path.join(root, 'package-lock.json');
const stamp = path.join(root, 'node_modules', '.pdms-lock-hash');
const hash = createHash('sha256').update(readFileSync(lock)).digest('hex');
if (existsSync(stamp) && readFileSync(stamp, 'utf8') === hash) {
  console.log('Already up to date: skipped.');
} else {
  console.log('Installing (first time, or the package list changed). About a minute...');
  if (run('npm', ['ci', '--no-audit', '--no-fund']).status !== 0) fail('npm ci did not work. Check the internet connection and run setup.cmd again.');
  writeFileSync(stamp, hash);
}

say('4. Build');
if (run('npm', ['run', 'build'], true).status !== 0) {
  run('npm', ['run', 'build']);
  fail('The build did not work: send Claude the lines above.');
}
const manifest = JSON.parse(readFileSync(path.join(root, 'dist', 'manifest.json'), 'utf8'));
console.log(`Built ${manifest.name} version ${manifest.version}.`);

say('5. In Chrome');
const dist = path.join(root, 'dist');
console.log(`Open chrome://extensions (Chrome is being opened on it now).
 - First time on this PC: turn on Developer mode (top right), press Load unpacked, choose ${dist}
 - Already loaded: press the round reload arrow on the PDMS card.
The card must say version ${manifest.version}. If the panel ever says "Reload needed", press that same arrow.`);
if (!process.env.PDMS_NO_CHROME) run('start', ['chrome', 'chrome://extensions'], true); // tests set PDMS_NO_CHROME
console.log('\nDone.');
