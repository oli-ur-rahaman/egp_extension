# Procurement Data Management System (PDMS)

A private Chrome (MV3) extension for the Public Works Department's Procurement Data Management System (PDMS). It collects report data from the Bangladesh e-GP portal (`eprocure.gov.bd`) into Excel. It works inside your own logged-in session and never handles your password.

| Document | What it is |
|---|---|
| [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md) | The working plan: modules, tasks, tests, dates, **progress log (§12)** |
| [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) | Technical design of record |
| [project_scope/](project_scope/) | Approved ToR and Proposal (highest precedence) |
| [CLAUDE.md](CLAUDE.md) | Working rules for Claude Code on either PC |

## Set up a PC, or bring it up to date: one double-click

Needs Windows, Google Chrome, [Git](https://git-scm.com/download/win) and [Node.js](https://nodejs.org) LTS (22 or later). First time only, get the code:

```
git clone https://github.com/oli-ur-rahaman/egp_extension.git C:\egp_extension
```

Then, **every time you sit down at either PC: double-click `C:\egp_extension\setup.cmd`.** It checks Git and Node, gets the latest from GitHub (never over unsaved work), installs packages only when they changed, builds, says which version it built, and opens `chrome://extensions`. There:

- **First time on this PC:** turn on **Developer mode** → **Load unpacked** → choose `C:\egp_extension\dist`.
- **Already loaded:** press the round **reload arrow** on the PDMS card. The card must show the version setup.cmd printed.

If a step fails, setup.cmd stops and says why in plain words. Browser tests (`npm run e2e`) also need `npx playwright install chromium` once; using the extension doesn't.

**What doesn't travel through GitHub** (it lives in one PC's browser or is git-ignored): your office hierarchy changes (use the panel's Office hierarchy → Export Excel, then Import Excel on the other PC), finished runs, `recon/raw/` captures and `project_scope/*.xlsx`.

## Daily routine (two PCs)

**Start of the day, on whichever PC you're at:**

Double-click `setup.cmd`, then press the reload arrow on the PDMS card in `chrome://extensions`.

**End of the day:**

```powershell
npm run verify  # lint + type-check + unit tests + build
git add -A
git status      # check: no credentials, no .chrome-* folder, no recon/raw, no exports
git commit -m "feat(m3): ..."
git push
```

Never leave work uncommitted on one PC overnight; the other PC can't see it.

## Commands

| Command | Does |
|---|---|
| `npm run build` / `npm run dev` | Build `dist/` once / rebuild on change |
| `npm run verify` | Everything that must be green before a commit |
| `npm test` / `npm run e2e` | Unit and golden tests / extension E2E in Playwright Chromium |
| `npm run chrome` | Open the separate debug Chrome used for recon (own profile, port 9222) |
| `npm run recon -- ping` | Check that Claude can see the debug Chrome |
| `npm run recon -- snapshot <label>` | Save a redacted copy of the current page to `recon/raw/` |
| `npm run recon -- watch <label> --seconds 60` | Record network traffic while you click |
| `npm run vendor` | Rebuild `vendor/` after changing a library version |

## What never goes into git

Login details, the debug Chrome profile (it holds your session cookies), raw recon captures, and extracted data. `.gitignore` enforces this. Check `git status` before every commit anyway. Fixtures under `tests/fixtures/` are committed only after the sanitiser has removed personal data.

The debug Chrome profile and `recon/raw/` stay on the PC where they were made. If you need a capture on the other PC, recapture it there.
