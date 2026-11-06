# CLAUDE.md

PDMS eGP Extractor: a private Chrome MV3 extension that collects report data from `eprocure.gov.bd` into Excel. The owner is a PWD employee with permission to develop it and has their own authorized e-GP account. No approvals from PWD need to be requested.

## Read first

0. `docs/BUILD_PLAN.md`: the stages and gates of the build, once approved.
1. `docs/EXECUTION_PLAN.md`. **§13 "Resume here"** says exactly what to do next; **§12 Progress log** says what has happened. Module sections (§7) carry task IDs (`M#-T##`), automated tests (`M#-AT#`) and the owner's manual checks (`M#-MC#`).
2. `docs/PROJECT_PLAN.md` for architecture and design decisions.
3. `docs/TIME_ESTIMATE.md` for the time estimate and sprints (D27); `docs/samples/` for the agreed output format (D24–D26; regenerate with `tools/make-output-demo.py`).
4. `docs/EGP_LIMITATIONS.md`: the portal's own faults, for re-audit on request. Add new ones as they are found. When one is fixed, propose its improvement to the owner.
4. `docs/INSIGHTS.md` for what we have learned about e-GP that shapes the build. **Add to it as soon as something is learned**; the owner asked for this.
5. When documents conflict: ToR > Proposal (`project_scope/*.docx`) > PROJECT_PLAN > EXECUTION_PLAN.

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

## Working with the owner

- **The owner holds ToR authority (D28):** the client delegated the decision, and what the owner says applies. **Warn the owner of every deviation from the ToR, Proposal or plan, plainly, when it happens.** The owner decides; record it as a `D#`. Never send them elsewhere for approval.
- The owner drives the browser and Claude observes. Give **numbered clicks for one small step**, then wait for "done". Say exactly what to report back. Don't assume a click happened: a background-task notice is not a reply.
- The owner knows the portal and the client. Their word on scope overrides the plan, so ask early for each flow: which filters, which fields, what limits the volume. Record each answer as a `D#` decision in `docs/PROJECT_PLAN.md` §8 and in the flow's note, and flag it when it departs from the ToR.
- **Detail-page data is the main purpose of the tool (D25),** not an extra. The two main uses of the output are analysing tenders by a department's PEs, and one contractor's whole journey (D24).
- Flow 2 set the pattern for what the owner wants: panel filters chosen per flow, a checkerboard for notice data, and mandatory filters that keep a run a sensible size. Measure a run's size (`totalPages`) before agreeing a limit, and give the time estimate.
- Recommend one option; don't just list them. Plain language, short messages. Say so plainly when a check failed or was skipped.

## Recon traps (learned the hard way)

- **Log every self-run flow test in `docs/recon/self-run-log.md`** (owner, 2026-11-06), including failed ones, so runs can be repeated logged in and compared (`tools/recon/study.js`, `study-compare.js`). A run that only waits on the portal must end with FINISHED or a stated stop reason: an exit code of 0 alone proves nothing.

- **Login state:** Flow 1 logged in; Flows 3–5 logged out; **Flow 2 in whichever state the user is in** (D23), because logged-out Flow 2 hides LTM tenders. The panel warns before a logged-out Flow 2 run.
- `npm run recon -- watch` records one tab only. A new tab or popup needs its own `--tab N` recording; tab numbers shift, so run `tabs` first. Start the recording **before** asking for the clicks, and give it plenty of time, because the owner may take a while.
- **`TaskStop` does not stop a recorder on Windows:** the node child survives. Always run `npm run recon -- stop`, and always **before asking the owner to log in**. Login and account pages are skipped by the recorder, but no recording should overlap a login anyway.
- Compare requests field by field before crediting a cause: a single space in `office` undid a confident conclusion. Print whole rows when comparing; four rows of ten gave a wrong claim about status.
- Tab numbers shift, and `watch --tab N` can land on DevTools: run `tabs` first and read the title it prints. `watch` also caught 0 requests on the right tab once, cause unknown, so check the count straight after the clicks. `snapshot` reads rows from the page and is the reliable fallback.
- Look at breakdowns before asking for more clicks: the LTM answer was already in a printed table.
- The recorder once missed requests with no error, and the cause is unknown. It now prints `LINK LOST` if its connection closes. Confirm a click's request really appears in `network.json`, and fall back to reading the page's inline JS, which often tells you more anyway.
- The response body in `network.json` is often the quickest source: a list response carries `totalPages` and the rows, so several clicks can be read from one recording.
- Print structure, not personal values. When reading captures, don't echo field values, account IDs or officials' names. Nothing with those goes into a commit; this repo is **public**.
- Never open `project_scope/id and pass.txt`.
- Run `npm run verify` before every commit, not just lint.
- Shell: backticks inside a double-quoted `node -e` or `sed` string run as commands, and regex backslashes get mangled. Write helper scripts to the scratchpad with the Write tool and pass the repo as the working directory. `require()` resolves relative to the script, so read files with `fs` and `process.cwd()`.
- `tools/launch-chrome.ps1 -WithExtension` relies on `--load-extension`, which regular Chrome is believed to have removed in version 137. Untested; if the icon doesn't appear, load `dist/` once via `chrome://extensions`.

## Layout and commands

`src/background` service worker · `src/content` content scripts · `src/panel` side panel · `src/shared` bus, schemas · `profiles/` Site Profile · `vendor/` pinned libs (hash-checked) · `tests/unit|golden|e2e|fixtures|mock-server` · `tools/` build, vendor, recon, launch-chrome.

`npm run verify` (lint + typecheck + unit + build) must be green before any commit. `npm run e2e` needs `npm run build` first.
