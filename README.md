# PDMS eGP Extractor

A private Chrome (MV3) extension for the Public Works Department's Procurement Data Management System (PDMS). It collects report data from the Bangladesh e-GP portal (`eprocure.gov.bd`) into Excel. It works inside your own logged-in session and never handles your password.

| Document | What it is |
|---|---|
| [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md) | The working plan: modules, tasks, tests, dates, **progress log (§12)** |
| [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) | Technical design of record |
| [project_scope/](project_scope/) | Approved ToR and Proposal (highest precedence) |
| [CLAUDE.md](CLAUDE.md) | Working rules for Claude Code on either PC |

## Set up a PC (once)

Requirements: Windows, Google Chrome, Git, Node.js 22 or later (24 recommended, see `.nvmrc`).

If PowerShell says *"npm.ps1 cannot be loaded because running scripts is disabled"*, allow local scripts for your Windows user once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Or skip the change and type `npm.cmd` instead of `npm` (for example `npm.cmd run chrome`).

```powershell
git clone https://github.com/oli-ur-rahaman/egp_extension.git C:\egp_extension
cd C:\egp_extension
npm ci
npx playwright install chromium   # only needed for npm run e2e
npm run build
```

Then load the extension in Chrome: `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick `C:\egp_extension\dist`. Click the toolbar icon to open the side panel.

**What doesn't travel through GitHub** (it lives in one PC's browser or is git-ignored): your office hierarchy changes (use the panel's Office hierarchy → Export Excel, then Import Excel on the other PC), finished runs, `recon/raw/` captures and `project_scope/*.xlsx`.

## Daily routine (two PCs)

**Start of the day, on whichever PC you're at:**

```powershell
git pull
npm ci          # only if package-lock.json changed
npm run build   # then press the reload icon on the extension in chrome://extensions
```

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
