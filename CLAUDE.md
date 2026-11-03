# CLAUDE.md

PDMS eGP Extractor: a private Chrome MV3 extension that collects report data from `eprocure.gov.bd` into Excel. The owner is a PWD employee with permission to develop it and has their own authorized e-GP account. No approvals from PWD need to be requested.

## Read first

1. `docs/EXECUTION_PLAN.md`. Its **§12 Progress log** says where work stands. Module sections (§7) carry task IDs (`M#-T##`), automated tests (`M#-AT#`) and the owner's manual checks (`M#-MC#`).
2. `docs/PROJECT_PLAN.md` for architecture and design decisions.
3. When documents conflict: ToR > Proposal (`project_scope/*.docx`) > PROJECT_PLAN > EXECUTION_PLAN.

## Two PCs

The owner works from two PCs and syncs through GitHub. Anything needed to continue the work belongs in the repo; nothing machine-specific (absolute paths, local profiles). At the end of each day: `npm run verify`, commit, push. At the start: `git pull`, `npm ci` if the lockfile changed, `npm run build`.

## After every piece of progress

Update `docs/EXECUTION_PLAN.md` in the same turn: tick task status markers (`[ ]` `[~]` `[x]` `[!]`) and add a line to §12 Progress log (date, week, task IDs, result, notes). This is how the other PC knows what happened.

## Hard rules

- No portal URL, CSS selector or column mapping outside `profiles/` and `tests/`. The `egp/no-site-knowledge` lint rule enforces it.
- Never read, log or store credentials, cookie values or tokens. Recon output is redacted before it touches disk (`tools/recon/redact.js`) and lives in the git-ignored `recon/raw/`.
- Never develop against the live portal. Build against fixtures and the mock server; live checks use the smallest filter selection that proves the point. On a CAPTCHA or block page, stop and record it; don't retry.
- No CAPTCHA solving, rate-limit evasion or IP rotation, ever.
- The owner has given Claude full control of commits and pushes: commit and push after each completed step. Never commit anything `.gitignore` excludes; check `git status` first. Conventional messages: `feat(m6): …`, `test(m4): …`, `recon(flow-3): …`, `docs: …`.

## Layout and commands

`src/background` service worker · `src/content` content scripts · `src/panel` side panel · `src/shared` bus, schemas · `profiles/` Site Profile · `vendor/` pinned libs (hash-checked) · `tests/unit|golden|e2e|fixtures|mock-server` · `tools/` build, vendor, recon, launch-chrome.

`npm run verify` (lint + typecheck + unit + build) must be green before any commit. `npm run e2e` needs `npm run build` first.
