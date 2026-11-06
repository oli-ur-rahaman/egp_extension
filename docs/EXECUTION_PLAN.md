# PDMS / eGP Extractor — Execution Plan

**Project:** Procurement Data Management System (PDMS) for Public Works Department (PWD)
**Codename:** `egp_ext`
**Artifact:** Private, unpacked Chrome MV3 extension for `https://www.eprocure.gov.bd`
**Document status:** v1.0 — Execution plan of record
**Prepared:** 2026-10-28
**Contractual duration:** 10 weeks build + 3 months warranty (per accepted Proposal §5)
**Visual companion:** [PDMS Build Map (flowcharts)](https://claude.ai/artifact/56gnXB3sre4BXwrZf1eA1q). It covers pre-start actions, how a data run works, build order and dates, the per-module loop, and recovery. It's private to you until you share it from the page's Share menu.

---

## 0. How to use this document

This is the **working plan** we follow week by week. It does not replace the other documents. It turns them into tasks, tests, checks and dates.

| Document | Role | Precedence if they conflict |
|---|---|---|
| `project_scope/[final] ToR_eGP_Chrome_Extension_Development.docx` | Contract obligations, acceptance criteria, payment milestones | **1 (highest)** |
| `project_scope/[final] Proposal_eGP_Chrome_Extension_Development.docx` | What we promised: deliverables, 10-week timeline, warranty terms | 2 |
| `docs/PROJECT_PLAN.md` (and `docs/plan.html`, an identical visual copy) | Technical design of record: architecture, recon method, UI, Guardian | 3 |
| `docs/EXECUTION_PLAN.md` (this file) | How and when we build it | 4 (derives from the above) |
| `docs/TOR-PROMPT*.md` | How the ToR was drafted. Historical, not binding | — |

**Conventions in this file**

- `M#` = module. `M#-T##` = task. `M#-AT#` = automated test that Claude writes and runs. `M#-MC#` = manual check that **you** perform and tick.
- `P-#.#` = a portal page or page state that we must inspect ("surf") during recon.
- `R#` = a recon session at the browser (from PROJECT_PLAN §2.2).
- `G#` = a gate. A phase does not close until its gate passes.
- Status markers: `[ ]` to do · `[~]` in progress · `[x]` done · `[!]` blocked.
- **"You"** means the project owner/developer. **"Claude"** means me, working in this repo. **"PWD officer"** means the officer PWD nominates to accept deliverables.

---

## 0a. What has changed since v1.0 (read this first)

Module sections below are the v1.0 plan. These decisions change them. Details are in `PROJECT_PLAN.md` §8.

| Decisions | Change | Modules |
|---|---|---|
| D11, D23 | Flow 1 logged in; Flows 3–5 logged out; Flow 2 runs in whichever state the user is in, and the panel warns that LTM tenders are off limits when logged out | M2, M3, M13 |
| D12 | Flow 2 "All" means blank, one sweep; only Flow 1 loops (offices) | M4 |
| D13, D15, D19, D20 | Mandatory filters per flow: Department + date window of at most 5 years, or + Financial Year on Flow 3 | M3, M13 |
| D21, D22 | A contractor filter lifts them, up to 5,000 rows | M3, M13 |
| D18 | **Live filters:** scan, apply to the real page, rescan; the profile names filters but never their items | M1, M3 |
| D14, D16 | One row per tender or package; more than one lot is flagged | M7, M9 |
| D24 | Output's purpose: PE analysis and contractor journey | M9, M10 |
| D25 | Detail data is the main purpose; checkerboard before Start | M7, M13 |
| D26 | Workbook = About + Data, with Filter columns. Departs from the ToR's "single sheet"; accepted by the owner (D28) | M9, M10 |
| D28 | The owner holds ToR authority. Claude warns of every deviation; the owner decides | all |
| D29 | LTM tenders are collected and exported on logged-in Flow 2 runs | M7, M10 |
| D27 | Time estimate, warnings, sprints (`docs/TIME_ESTIMATE.md`) | M8, M10, M13 |
| Recon | List size 100 by default; a full sweep **loses rows**, so distinct IDs must equal the computed total | M6, M9 |

## 1. Things to resolve before Week 1

I found these while cross-reading the documents. Items 1 and 2 are urgent. The rest change scope or schedule and need a decision from you.

| # | Finding | Why it matters | Recommended action | Owner |
|---|---|---|---|---|
| **X1** | `project_scope/id and pass.txt` is **not covered by `.gitignore`**, and `.gitignore` says the repo is public. Nothing is committed yet (no commits exist). | The first `git add .` would publish what looks like portal credentials. The extension's core principle is zero credential handling. | Move the file out of the repo and into a password manager. Then add `project_scope/id and pass.txt` (or `project_scope/*.txt`) to `.gitignore` section 4 **before the first commit**. | You, **today** |
| **X2** | `.gitignore` header says *"this repo is public"*. The Proposal (§10.1 Ownership, §10.2 Confidentiality) and ToR §13–14 give PWD full ownership and forbid disclosure without PWD's written permission. | A public repo could be read as a breach of the confidentiality clause. | Keep the repo **private** (GitHub private repo, or local only) until PWD gives written permission. Hand over to the repository PWD nominates (Proposal §3). | You |
| **X3** | **Tender Info changed pattern.** PROJECT_PLAN lists it as List-only (Pattern A). The approved ToR §3.2 puts it in **Pattern B (List + Detail)**. | The ToR governs. Four of the five flows now need detail-page harvesting, so the detail engine carries more weight in the schedule. | Plan uses ToR: **Pattern A = Flow 1 only; Pattern B = Flows 2–5.** Recon R3 confirms what the detail page holds. | Settled (ToR) |
| **X4** | **Timeline mismatch.** ToR §9 milestone table totals **8 weeks** (1+2+2+2+1). The accepted Proposal §5 commits to **10 weeks**. The Proposal's Gantt has only 6 week columns. | Acceptance dates must not be argued over later. | Work to the **Proposal's 10 weeks** (Section 3 below). Ask the PWD officer to confirm the milestone dates in writing at kick-off. | You + PWD officer |
| **X5** | **Portal access timing.** ToR M1 requires *"filter mirroring for all five pages"* at the end of Phase 1. The Proposal §5/§9 assumes PWD workstation and portal access only **"from Week 2 onward"**. ToR §15 says development may use **only PWD's own authorized account**. | Phase 1 can't happen without live access to all five report pages. | Ask PWD to provide the authorized account (or a supervised session) **from Day 1**. If that isn't possible, M1 moves to the end of Week 3 and every later date shifts by one week. | You → PWD |
| **X6** | **AI-assisted repair (Dev mode Path B)** sends sanitised DOM to an external AI API. The ToR (§3.1, §13 maintenance mode) asks only for diagnostics, a drift report, and apply/rollback. ToR §14 is a confidentiality clause. | Path B is beyond the contract and sends data off the machine. | Build Path A (drift report + apply/rollback) as the **contractual deliverable**. Build Path B last, off by default, and enable it only with PWD's written consent. D3 (both paths) stays locked. This only orders and gates the work. | You |
| **X7** | PROJECT_PLAN uses `D:\Laragon-root\www\egp_ext`. The real working tree is `C:\egp_extension`. | Scripts that hard-code the wrong path will fail. | All tools use repo-relative paths. `launch-chrome.ps1` takes the profile dir as a parameter. | Claude (M0) |
| **X8** | Open decisions Q7 (secret code) and D8 (no IP rotation) from PROJECT_PLAN §8. The ToR §3.3 now **excludes** IP rotation explicitly. | D8 is now settled by contract. | D8 is **closed: no proxying, ever, in this contract**. Q7 is still yours to choose before Week 9. Only its salted hash goes into the repo. | You |
| **X9** | Confidentiality (ToR §14): test files and recordings must be deleted or handed over at the end. | Fixtures captured from the live portal may contain names and account identifiers. | Every fixture passes the **sanitiser** (M1-T07) before it is committed. Raw captures live only in the git-ignored `recon/raw/` and are handed over or wiped at M5 (M14-T08). | Claude + You |

**Status as of 2026-11-04**

| # | Status | Resolution |
|---|---|---|
| X1 | [x] | `.gitignore` §4 now ignores `project_scope/*.txt` and `*pass*.txt`. Verified with `git check-ignore`. The file stays on this PC only; moving it to a password manager is still recommended. |
| X2 | [x] | Owner's decision (2026-11-04): the repo is **public**. ToR and Proposal are committed. Fixtures are committed only after sanitising (X9). |
| X3 | [x] | Settled by the ToR. |
| X4 | [x] | Owner's call. The 10-week plan stands. Work actually started Wed 4 Nov, 3 working days after the planned Sun 1 Nov; the slip is absorbed by the contingency unless it grows. |
| X5 | [x] | The owner is a PWD employee with an authorized account and permission to develop. No note to PWD is needed. |
| X6 | [x] | The owner has permission to decide. Path B is still built last and off by default. |
| X7 | [x] | All tools use repo-relative paths; `launch-chrome.ps1` takes `-ProfileDir`. |
| X8 | [~] | D8 closed. Q7 (secret code) still open, needed by Week 9. |
| X9 | [~] | Redaction in the recon harness is done (M0-T08). The sanitiser comes with M1-T07. |

---

## 2. Scope in one page

**The five flows (per approved ToR)**

| # | Flow ID | Report page | Pattern | Detail tab per row |
|---|---|---|---|---|
| 1 | `procurement_transaction_report` | Procurement Transaction Report | **A** — List | No |
| 2 | `tender_info` | Tender Info | **B** — List + Detail | Yes |
| 3 | `app_info` | APP Info | **B** — List + Detail | Yes |
| 4 | `contract_info` | Contract Info | **B** — List + Detail | Yes |
| 5 | `experience_info` | Experience Info | **B** — List + Detail | Yes |

**Non-negotiables (ToR §3.1, §3.3, §15):** the user logs in personally. The extension handles no credentials, has no server component, and does no CAPTCHA, WAF or rate-limit circumvention. No IP rotation. No Web Store. No attachment downloads.

**Acceptance (ToR §11), all five must be witnessed live:**

1. A real run on the actual portal produces a correct Excel report.
2. The run resumes after an interruption with no lost or repeated data.
3. The tool stops and warns, instead of exporting wrong data, when the portal looks different.
4. Source code and all files are handed over and work on a PWD computer.
5. The user guide is handed over and training is delivered satisfactorily.

---

## 3. Timeline at a glance

### 3.1 Tentative time frame

| Item | Duration | Tentative dates* |
|---|---|---|
| Pre-start actions (Section 1) | 3 working days | Wed 28 Oct – Sun 1 Nov 2026 |
| **Build: Phases 1–5** | **10 weeks** | **Sun 1 Nov 2026 – Thu 7 Jan 2027** |
| Contingency (not in contract; used only if needed) | up to 2 weeks | to Thu 21 Jan 2027 |
| **Warranty** (ToR §12, Proposal §4) | **3 months** from final acceptance | ~8 Jan 2027 – ~7 Apr 2027 |
| Final 10% payment | at warranty close | ~Apr 2027 |

\* Dates assume work starts on **Sunday 1 November 2026** with a Sunday–Thursday working week. If the contract is signed on a different date, shift every date by the same offset. Holidays inside the window: **Victory Day, Wed 16 Dec** (Week 7). 25 Dec falls on a Friday (the weekend). The plan already accounts for both.

**My honest estimate:** 10 weeks is achievable **if** portal access starts in Week 1 (X5) and the pages are server-rendered HTML (assumption A3). The most likely causes of slippage are:

- a JavaScript SPA on any flow (+3–5 days per flow)
- an unexpectedly deep or irregular cascade (+2–3 days)
- CAPTCHA appearing under load, which would force a policy discussion

Plan for 10 weeks and keep the 2-week contingency private.

### 3.2 Schedule (ASCII Gantt)

```
Week:                    1   2   3   4   5   6   7   8   9   10
                         ─────────────────────────────────────────
ToR Phase 1  Config+Mirror ███████                                   → M1 (end W2)
  M0 Foundation          ██
  M1 Recon + Profile     ███████
  M3 Filter mirroring        ████
ToR Phase 2  Plan+List           ███████████                         → M2 (end W5)
  M2 Sentinel (basic)            ██
  M4 Combination planner         ████
  M5 Engine + Store + Resume     ██████
  M6 List extraction                 ██████
  M13 Panel UI (core)                ██████
ToR Phase 3  Detail+Resume+Pace              ███████                 → M3 (end W7)  💰 40%
  M7 Detail extraction                       ██████
  M8 Recovery + pacing                           ████
ToR Phase 4  Validate+Export+Integrity               ███████         → M4 (end W9)
  M9 Data quality + Reconcile                        ████
  M10 Excel export                                   ████
  M11 Guardian + Maintenance                             ████
  M12 Logs + audit (finalise)                            ██
ToR Phase 5  Test+Docs+Handover                               ████   → M5 (end W10) 💰 50%
  M14 Docs, UAT, training, handover                           ████
Warranty                                                          ▶ 3 months      💰 10%
```

### 3.3 Milestones, gates and payments

| Milestone | Due (tentative) | What PWD witnesses | Gate | Payment |
|---|---|---|---|---|
| **M1** | Thu 12 Nov 2026 (end W2) | Filter mirroring live on all five report pages | G1 | — |
| **M2** | Thu 3 Dec 2026 (end W5) | List extraction with cascading discovery on live portal, all five list pages | G2 | — |
| **M3** | Thu 17 Dec 2026 (end W7) | Detail-tab extraction (Flows 2–5), kill-and-resume, pacing and recovery, login-wall pause/resume | G3 | **40% (BDT 40,000)** |
| **M4** | Thu 31 Dec 2026 (end W9) | Reconciled Excel export, preflight refusal, drift report, maintenance mode apply/rollback | G4 | — |
| **M5** | Thu 7 Jan 2027 (end W10) | UAT passed, all deliverables handed over, training delivered | G5 | **50% (BDT 50,000)** |
| Warranty close | ~Thu 8 Apr 2027 | No unresolved defect | — | **10% (BDT 10,000)** |

Proposal §9 says PWD feedback is due within **5 working days** of a phase demo. After that, the phase counts as accepted for the purpose of proceeding. Record every demo date and the date its feedback arrived in the [Section 12 log](#12-progress-log).

---

## 4. Ways of working

### 4.1 Roles

| Who | Does |
|---|---|
| **You** | Own login and portal navigation. Drive the debug Chrome during recon. Make domain decisions (natural keys, column meanings). Tick every `MC` check. Present demos to PWD. |
| **Claude** | Recon scripting and observation over CDP. All code, the Site Profile, fixtures, the mock server, and all automated tests. Docs drafting. Turns each recon session into a written note. Commits and pushes after each completed step (owner granted full control, 2026-11-04). |
| **PWD officer** | Witnesses milestone demos. Gives written feedback within 5 working days. Signs UAT. Provides the authorized account. |

### 4.2 Session rhythm (each working block)

1. **Open:** Claude states the task IDs for the block, the pages needed (if any), and what you'll be asked to click.
2. **Build:** Claude implements against fixtures and the mock server first. Claude never develops against the live portal.
3. **Verify:** Claude runs the automated tests (`npm test`, plus `npm run e2e` where relevant) and reports results verbatim, including failures.
4. **Check:** you run the listed `MC` items. Live checks use the **smallest filter selection that proves the point** (PROJECT_PLAN §7.7).
5. **Close:** update task status in this file, add a progress-log line, and commit with a conventional message (`feat(m6): …`, `test(m4): …`, `recon(flow-3): …`).

### 4.3 Live-portal rules (always on)

- Live-portal work happens only in the **dedicated debug Chrome profile**, logged in by you, inside PWD's authorized account.
- Claude's recon scripts **never read** password inputs, token-like fields, or cookies' values. They redact before writing anything to disk.
- No more than one live run at a time. During development, keep live runs to about **3 combinations and 2 pages** unless the task says otherwise.
- If the portal shows a CAPTCHA, a warning, or anything that looks like a block, **stop immediately** and record it. Don't retry.

### 4.4 Definition of Done (any task)

- Code merged on `main` with no lint errors and `checkJs` clean.
- Its automated tests (`AT`) exist and pass. Bug fixes come with a regression test.
- No selector, URL or column mapping outside `profiles/` (enforced by a lint rule, M0-T06).
- Its `MC` checks are ticked by you, where the task has them.
- Any affected docs are updated.

### 4.5 Repository layout (target)

```
C:\egp_extension\
├─ manifest.json
├─ src/
│  ├─ background/   engine/ planner/ store/ sentinel/ governor/ recovery/ exporter/ guardian/ log/ tabs/
│  ├─ content/      filter-reader, filter-applier, table-parser, detail-parser, page-classifier
│  ├─ panel/        index.html, components/, styles/
│  └─ shared/       profile-loader, schemas, bus, ids, hash, types
├─ profiles/        eprocure.gov.bd.json, schema.json
├─ vendor/          sheetjs, idb (pinned + hashed)
├─ tests/           unit/ golden/ fixtures/ e2e/ mock-server/
├─ tools/           launch-chrome.ps1, recon/, sanitise, validate-profile, hash-code
├─ recon/raw/       (git-ignored) unsanitised captures
└─ docs/            PROJECT_PLAN.md, EXECUTION_PLAN.md, recon/, OPERATIONS.md, MAINTENANCE.md, SITE-PROFILE.md, CHANGELOG-PROFILE.md, TEST-REPORT.md, USER-GUIDE.md
```

---

## 5. Module catalogue

Each row names the module, the ToR clause it satisfies, and when it gets built.

| ID | Module | ToR module (§4) / clause | Built in | Depends on |
|---|---|---|---|---|
| **M0** | Foundation & tooling | §5 platform, §8 | W1 | — |
| **M1** | Recon harness & Site Profile | §5 Configuration File; Spec 11 externalised site | W1–W2 (+ refresh later) | M0 |
| **M2** | Page Sentinel (page classification) | Self-Check; fail-loud | W3 (basic), W7 (full) | M1 |
| **M3** | Filter Setup (read, mirror, apply) | **Filter Setup** | W2 | M1 |
| **M4** | Auto-Combination Planner (cascade tree walk) | **Auto-Combination Search** | W3 | M3 |
| **M5** | Job Engine, Store & Save/Resume | **Save & resume** | W3–W4 | M0 |
| **M6** | List Data Collection | **List Data Collection** | W4–W5 | M4, M5, M2 |
| **M7** | Detail Data Collection | **Detail Data Collection** | W6–W7 | M6 |
| **M8** | Safe-Speed & Recovery | **Safe-Speed & Recovery** | W7 | M2, M5 |
| **M9** | Data Check & Reconciliation | **Data Check & Reconciliation** | W8 | M6, M7 |
| **M10** | Excel Export | **Excel Export** | W8 | M9 |
| **M11** | Self-Check & Maintenance (Guardian, Dev mode) | **Self-Check & Maintenance** | W9 | M1, M2 |
| **M12** | Activity Log & Audit | **Activity Log** | W3 (skeleton), W9 (final) | M5 |
| **M13** | Side Panel UI | §5 User Interface | W4–W5, polish W8–W9 | M3, M5 |
| **M14** | Testing, Documentation, Training & Handover | §6 Deliverables, §10, §11 | W10 (docs drafted throughout) | all |

---

## 6. Page inventory — what we inspect ("surf")

Claude can't design against pages it hasn't seen, so every page and page state below gets inspected once, live, with you driving. Each one produces a **sanitised HTML fixture** (`tests/fixtures/<flow>/<state>.html`). The fixtures feed the mock server, the golden tests and the drift baseline.

### 6.1 Portal shell (R1 — Week 1)

| Page ID | Page / state | What Claude captures | Feeds |
|---|---|---|---|
| P-0.1 | Login page (logged out) | Login form signature and URL pattern. **Not** field values. | M2 `LOGIN_WALL` |
| P-0.2 | Post-login home / dashboard | Nav structure, menu path to each report, session cookie *name* only | M1, M0 |
| P-0.3 | Report menu / navigation tree | Route to each of the five flows; whether direct URLs work | M1 |
| P-0.4 | Session-expired page (you let it idle) | Expiry signature, redirect behaviour, idle timeout length | M2, M8 |
| P-0.5 | Error / maintenance page (if seen) | Signature text and markup | M2 `SERVER_ERROR` |
| P-0.6 | Logout result | Post-logout redirect | M2 |
| P-0.7 | Any CAPTCHA / warning page (if ever seen) | Signature only. Never interact. | M2 / risk R8 |

### 6.2 Per-flow pages (R2–R6)

The same state set is captured for every flow. Pattern B flows also capture the detail-page states.

| State | Page ID pattern | Description | Recon checklist (PROJECT_PLAN §2.3) |
|---|---|---|---|
| Initial | P-n.1 | Report page freshly loaded, filters at defaults | A1–A2, B3, B7 |
| Cascade | P-n.2 | After each parent filter changes (child populated). One capture per dependency level. | B4 |
| Validation | P-n.3 | Search pressed with a mandatory filter missing | B5 |
| Results p1 | P-n.4 | First result page, with total text ("1–20 of N") | C8–C10 |
| Results pN | P-n.5 | Middle and last result pages, plus page-size control if it exists | C11 |
| Empty | P-n.6 | Legit zero-results state | C12 |
| Search XHR | P-n.7 | Request/response shape of the search call (network capture, redacted) | F20 |
| Detail | P-n.8 | Detail page for a row (**Flows 2–5**), including any nested tables | D13–D15 |
| Detail-empty | P-n.9 | Detail page with missing optional sections (**Flows 2–5**) | D15 |
| Parent-after-close | P-n.10 | List page after the detail tab closes. Does pagination hold? (**Flows 2–5**) | D16 |

| Flow | Session | Week | Pages | Special focus |
|---|---|---|---|---|
| 1 · Procurement Transaction Report | R2 | W1 | P-1.1 … P-1.7 | Cascade depth; page size; is there a fast path? |
| 2 · Tender Info | R3 | W2 | P-2.1 … P-2.10 | **Confirm detail-page content (X3)**; detail URL determinism |
| 3 · APP Info | R4 | W2 | P-3.1 … P-3.10 | APP detail is often a multi-row package table, which means one-to-many fields |
| 4 · Contract Info | R5 | W2 | P-4.1 … P-4.10 | Currency and amount formats; date formats |
| 5 · Experience Info | R6 | W2 | P-5.1 … P-5.10 | Natural key for dedupe (Q6) |

**Your time at the browser:** about 1.5 h for R0+R1 and about 1.5–2 h per flow. In total, **about 10–12 hours across Weeks 1–2**, plus short live checks later.

---

## 7. Module plans

Every module below lists purpose, the pages it touches, tasks, Claude's automated tests, your manual checks, and exit criteria.

---

### M0 — Foundation & tooling (Week 1)

**Purpose:** a repo where the extension loads, builds and tests from day one.
**Pages:** none (P-0.x only to prove the CDP link).

| Status | Task | Description | Est. |
|---|---|---|---|
| [x] | M0-T01 | Resolve X1/X2 (credentials file out, `.gitignore` updated, private remote), then make the first commit | 0.5 h |
| [x] | M0-T02 | `package.json`, esbuild config, `npm run build / dev / test / e2e / lint` | 2 h |
| [x] | M0-T03 | `manifest.json` (MV3) with minimum permissions: `sidePanel, storage, scripting, tabs, downloads, notifications`, host `*://*.eprocure.gov.bd/*`. No `proxy`, no `<all_urls>` | 1 h |
| [x] | M0-T04 | Side panel "hello" that opens from the toolbar icon; service worker heartbeat | 2 h |
| [x] | M0-T05 | ESLint plus JSDoc `checkJs`; Vitest and Playwright scaffolding; vendored `idb` and SheetJS, pinned, with a SHA-256 manifest | 3 h |
| [x] | M0-T06 | Custom lint rule: forbid CSS selectors and portal URLs outside `profiles/` and `tests/` | 2 h |
| [x] | M0-T07 | `tools/launch-chrome.ps1 -ProfileDir <path> -Port 9222` (dedicated profile, git-ignored) | 1 h |
| [x] | M0-T08 | CDP recon harness (`tools/recon/`): attach, dump DOM, enumerate `<select>` options, capture network, **redact password and token fields**, write to `recon/raw/` | 5 h |

**Built in M0 (2026-11-04):** `tools/build.js` bundles `src/` into `dist/` (load `dist/` unpacked). `tools/vendor.js` writes `vendor/idb.js` (idb 8.0.4) and `vendor/xlsx.js` (SheetJS 0.20.3, from the official SheetJS CDN tarball, not the stale npm package) plus `vendor/SHA256SUMS`. The lint rule is `tools/eslint-rules/no-site-knowledge.js`; its literal-argument check on `querySelector()` and similar applies only to `src/content/`, so the panel can look up its own elements. Recon: `npm run recon -- ping | tabs | snapshot <label> | watch <label>`. `npm audit` reports 5 moderate issues in ESLint's `minimatch`; they are development-only and ship nothing to the extension.

- **Automated (Claude):** [x] M0-AT1 build succeeds · [x] M0-AT2 manifest validates (`tests/unit/manifest.test.js`: MV3, exact permissions, no proxy or broad hosts, CSP self-only) · [x] M0-AT3 lint and type-check clean · [x] M0-AT4 lint rule catches a planted selector in `src/` (`tests/unit/no-site-knowledge.test.js`) · [x] M0-AT5 redaction unit test (`tests/unit/redact.test.js`) · [x] extra: vendor hashes match (`tests/unit/vendor.test.js`) · [x] extra: E2E smoke, the built extension loads in Chromium and the panel reports Ready (`tests/e2e/extension.spec.js`).
- **Manual (You):**
  - [ ] M0-MC1 `chrome://extensions` → Load unpacked → **no errors**
  - [ ] M0-MC2 Clicking the icon opens the side panel
  - [x] M0-MC3 `launch-chrome.ps1` opens a separate Chrome. Claude confirms the attach (R0).
  - [ ] M0-MC4 `git status` shows no credentials file and no `.chrome-*` folder
- **Exit:** R0 done; CI-style `npm run verify` green.

---

### M1 — Recon harness & Site Profile (Weeks 1–2, refreshed as needed)

**Purpose:** capture complete, evidence-backed knowledge of the portal in one versioned JSON file. No site knowledge goes anywhere else.
**Pages:** all of Section 6.

| Task | Description | Est. |
|---|---|---|
| M1-T01 | `profiles/schema.json`: flows, filters (`dependsOn`, `children`, `skipOptionPatterns`, fallbacks), search (`mode: xhr / postback`), results, pagination, detail, pageAssert, sentinel signatures | 4 h |
| M1-T02 | **R1** portal shell session → `docs/recon/00-portal-shell.md` | 2 h |
| M1-T03 | **R2** Flow 1 → `docs/recon/flow-1.md` + profile fragment + fixtures | 3 h |
| M1-T04 | **R3–R6** Flows 2–5 → `flow-2..5.md` + fragments + fixtures | 10 h |
| M1-T05 | Merge the fragments into `profiles/eprocure.gov.bd.json` **v1.0.0** | 2 h |
| M1-T06 | Profile loader with a 3-layer merge (shipped → override → session) and schema validation at load | 3 h |
| M1-T07 | **Fixture sanitiser**: strips names, emails, phone numbers, tokens and hidden `__VIEWSTATE`-style blobs where they're not needed; leaves a structural copy | 3 h |
| M1-T08 | **Mock eGP server** (`tests/mock-server/`): replays fixtures, simulates cascades, pagination, empty results, detail pages, and a configurable latency | 6 h |
| M1-T09 | Record answers to Q1–Q6 in `PROJECT_PLAN.md` §8; record the extraction-path decision (fast path vs UI path) per flow | 1 h |
| M1-T10 | Structural fingerprint baseline per fixture (DOM-skeleton hash + landmarks) | 2 h |

- **Automated (Claude):** M1-AT1 profile validates against the schema · M1-AT2 the mock server serves every fixture and every cascade transition · M1-AT3 a sanitiser test proves no planted PII or token survives · M1-AT4 the loader merges layers in the correct priority · M1-AT5 every profile selector resolves on its fixture.
- **Manual (You):**
  - [ ] M1-MC1 R0–R6 completed together
  - [ ] M1-MC2 You read each recon note and confirm it matches the portal and the business meaning
  - [ ] M1-MC3 You confirm the **natural key** columns per flow (Q6)
  - [ ] M1-MC4 You confirm Tender Info detail content (X3)
  - [ ] M1-MC5 You spot-check two sanitised fixtures and see no personal data
- **Exit:** profile v1.0.0 committed; Q1–Q6 answered; mock server covers every P-n state.

---

### M2 — Page Sentinel (Week 3 basic, Week 7 complete)

**Purpose:** after every navigation or search, classify the page as exactly one of `OK / EMPTY / LOGIN_WALL / RATE_LIMITED / SERVER_ERROR / TIMEOUT / SHAPE_CHANGED`.
**Pages:** P-0.1, P-0.4, P-0.5, P-0.7, P-n.4, P-n.6, P-n.8.

| Task | Description | Est. |
|---|---|---|
| M2-T01 | Page classifier content script, driven by the `pageAssert` and `sentinel` profile entries | 4 h |
| M2-T02 | Settle detection (DOM-quiet + expected landmark) with a time budget → `TIMEOUT` | 3 h |
| M2-T03 | `SHAPE_CHANGED` evidence capture: sanitised snippet, expected vs found | 3 h |
| M2-T04 | Signatures for login wall, expiry and error, built from **real** R1 captures (W7) | 2 h |
| M2-T05 | Latency-based `RATE_LIMITED` heuristic hooked to the governor (W7) | 2 h |

- **Automated:** M2-AT1 every fixture classifies to its expected outcome (table-driven) · M2-AT2 a mutated fixture (column renamed or removed) → `SHAPE_CHANGED`, never `OK` · M2-AT3 an empty fixture → `EMPTY`, never `SHAPE_CHANGED`.
- **Manual:**
  - [ ] M2-MC1 On the live portal, Claude shows the classifier output for an `OK` page and an `EMPTY` page
- **Exit:** zero misclassifications across the fixture library.

---

### M3 — Filter Setup: read, mirror, apply (Week 2) → milestone M1

**Purpose:** read the page's filters, reproduce them in the panel with an **"All"** checkbox each, and apply the chosen values back to the real page.
**Pages:** P-n.1, P-n.2, P-n.3 for all five flows.

| Task | Description | Est. |
|---|---|---|
| M3-T01 | Filter Reader: label, type, options (skipping placeholders) via the profile, with fallbacks | 4 h |
| M3-T02 | Filter Applier: set a value, fire the correct events (change/input/postback), and **wait for the child to repopulate** | 5 h |
| M3-T03 | Dependency awareness: refresh child lists in the panel when the parent changes in the panel | 3 h |
| M3-T04 | Panel filter card: select + "All" checkbox; "All" disables the select and shows `all N items`; "↳ depends on X" hint | 4 h |
| M3-T05 | Page-match check: "✓ Page matches this flow" or a named reason | 2 h |
| M3-T06 | Date-range and text filters (if recon finds them), with format and max-span validation | 3 h |

- **Automated:** M3-AT1 reader output equals the golden JSON for each P-n.1 fixture · M3-AT2 the applier on the mock triggers a child repopulation and waits for it · M3-AT3 placeholder options never appear as values · M3-AT4 a flow mismatch blocks with the right reason.
- **Manual:**
  - [ ] M3-MC1 On **each of the five live pages**, the panel shows the same dropdowns and options as the page
  - [ ] M3-MC2 Choosing a value in the panel visibly changes the real page; the child list updates
  - [ ] M3-MC3 "All" shows the correct item count
- **Gate G1 (end W2):** M0, M1, M3 exit criteria met → **demo M1 to the PWD officer.**

---

### M4 — Auto-Combination Planner: cascade tree walk (Week 3)

**Purpose:** iterate "All" filters as a **lazy, depth-first tree walk**. A child's options are discovered only after its parent is selected (ToR's most-misunderstood requirement). No pre-computed cartesian product.
**Pages:** P-n.2 (all cascade levels).

| Task | Description | Est. |
|---|---|---|
| M4-T01 | Planner: depth-agnostic recursive walk over the filter dependency graph | 5 h |
| M4-T02 | Deterministic combination ID = hash(flow, ordered filter values) | 1 h |
| M4-T03 | Path cursor `[i0, i1, …, page]` stored in the checkpoint; resume re-enters the exact branch | 3 h |
| M4-T04 | Live estimate `≈ N combinations`, refined as branches are discovered; hard budget cap | 2 h |
| M4-T05 | An empty-children parent is recorded as a legitimate empty branch | 1 h |
| M4-T06 | Mixed selection: some filters fixed, others "All" | 2 h |

- **Automated:** M4-AT1 a 3-level synthetic tree visits every leaf exactly once · M4-AT2 the walk never asks for child options before the parent is selected (spy test) · M4-AT3 IDs are stable across runs · M4-AT4 resume from any cursor gives the identical remaining sequence · M4-AT5 empty branches are recorded, not errored.
- **Manual:**
  - [ ] M4-MC1 Claude walks through the walk log for a small real cascade (1 Ministry × All Agencies). You confirm it matches the portal's agencies.
- **Exit:** all AT pass; the walk is depth-agnostic.

---

### M5 — Job Engine, Store & Save/Resume (Weeks 3–4)

**Purpose:** the service worker owns all state. Every mutation is persisted to IndexedDB before it's acknowledged, so a run survives a service-worker kill, a closed tab, or a closed browser.
**Pages:** none (works against the mock).

| Task | Description | Est. |
|---|---|---|
| M5-T01 | IndexedDB schema: `runs`, `sprints`, `combinations`, `pages`, `rows`, `details`, `checkpoints`, `logs` | 3 h |
| M5-T02 | Run state machine: `idle → planning → running ⇄ paused → recovering → completed / stopped / halted` | 4 h |
| M5-T03 | Typed message bus (panel ⇄ SW ⇄ content), request/response plus events | 3 h |
| M5-T04 | Checkpoint after each page and each combination; rows written as parsed | 3 h |
| M5-T05 | Resume on SW wake-up and browser start (offer to resume) | 3 h |
| M5-T06 | `row_hash` from the natural key (from M1-MC3) for idempotent writes | 2 h |
| M5-T07 | Keep-alive and alarm strategy for MV3 service-worker lifetime | 2 h |
| M5-T08 | Structured logger skeleton (feeds M12) | 2 h |

- **Automated:** M5-AT1 **kill-and-resume simulation**: kill the SW at random points over 50 runs, with zero lost and zero duplicate rows · M5-AT2 state-machine transition table, including illegal transitions · M5-AT3 resume after a full-browser-restart simulation (Playwright persistent context) · M5-AT4 writing the same rows twice yields one copy.
- **Manual:**
  - [ ] M5-MC1 Claude demos a fake 3-level run on the mock, kills the service worker (`chrome://serviceworker-internals` → Stop) mid-run, and it resumes exactly
  - [ ] M5-MC2 You close Chrome entirely mid-run, reopen it, and the panel offers to resume
  - [ ] M5-MC3 The log output is readable to you
- **Exit:** M5-AT1 is green 50/50.

---

### M6 — List Data Collection (Weeks 4–5) → milestone M2

**Purpose:** parse every result row on every page of every combination. Flow 1 goes end-to-end first, then the list part of Flows 2–5.
**Pages:** P-n.4, P-n.5, P-n.6, P-n.7 for all flows.

| Task | Description | Est. |
|---|---|---|
| M6-T01 | Table Parser: header verification, column mapping by **header text** (not only position), type hints | 4 h |
| M6-T02 | Pagination driver: numbered / next / page-size (raise it where allowed, Q3) | 4 h |
| M6-T03 | Total-text parser ("of N"). This is the correctness oracle stored per combination. | 2 h |
| M6-T04 | **Fast path** (if recon found a clean XHR): replay the search call; fall back to the UI path automatically and log the downgrade | 5 h (only if applicable) |
| M6-T05 | **Flow 1 vertical slice** on mock → live (small selection) | 4 h |
| M6-T06 | Flows 2–5 list profiles. **Success criterion: profile JSON only, zero engine changes.** If the engine needs changes, fix the abstraction here. | 4 h |
| M6-T07 | Runtime assertions per page: column count, header text, cell types → `SHAPE_CHANGED` on mismatch | 2 h |
| M6-T08 | Raw (interim) CSV/JSON dump for debugging only, not the deliverable | 1 h |

- **Automated:** M6-AT1 golden-file parser tests per flow (fixture → expected rows) · M6-AT2 pagination on the mock: 1, 2, N pages; last page short · M6-AT3 a shifted-column fixture fails loud · M6-AT4 an empty result → zero rows + `EMPTY` · M6-AT5 the fast path and UI path produce identical rows on the mock.
- **Manual:**
  - [ ] M6-MC1 Small live run of Flow 1 (one ministry, one year): rows **match the screen**, spot-checked row by row (10 rows)
  - [ ] M6-MC2 Collected row count equals the portal's "of N" total
  - [ ] M6-MC3 The same check for the list part of each of Flows 2–5 (3 rows each)
- **Gate G2 (end W5):** M2, M4, M5, M6 and the core of M13 pass → **demo M2.**

---

### M7 — Detail Data Collection (Weeks 6–7, Flows 2–5)

**Purpose:** for each list row, open its detail in a **managed background tab**, extract it, close the tab, and return without disturbing the list's pagination. Merge list and detail fields into one flat record.
**Pages:** P-n.8, P-n.9, P-n.10 for Flows 2–5.

| Task | Description | Est. |
|---|---|---|
| M7-T01 | Tab Manager: open (background), track, timeout, close, crash detection, orphan cleanup on start; hard cap on concurrent tabs (default 1) | 5 h |
| M7-T02 | **Direct-URL path** when the detail URL is deterministic (Q2): navigate directly, skip the click | 2 h |
| M7-T03 | Click path when it isn't: intercept `window.open` / `target=_blank` | 3 h |
| M7-T04 | Detail Parser: label→value pairs and nested tables (one-to-many) | 5 h |
| M7-T05 | Flattening rule for one-to-many fields (decided with you: one row per child, or joined text, per flow) | 2 h |
| M7-T06 | Detail-level checkpoint: a row is "done" only when its detail is stored | 2 h |
| M7-T07 | Parent-state guard: verify the list page/position after return; re-apply from the checkpoint if it was lost | 3 h |
| M7-T08 | Profiles for Flows 2, 3, 4, 5 detail pages | 6 h |

- **Automated:** M7-AT1 tab lifecycle including "tab crashed mid-extract" · M7-AT2 **leak test: 200 details, zero tabs left open** · M7-AT3 merge golden tests per flow · M7-AT4 a resume mid-detail neither duplicates nor skips that row · M7-AT5 the parent's pagination is preserved (mock asserts page index).
- **Manual:**
  - [ ] M7-MC1 Detail tabs open and close cleanly; nothing piles up (watch the tab strip)
  - [ ] M7-MC2 The list page keeps its place
  - [ ] M7-MC3 Detail fields match the detail page on **5 rows per flow** (20 rows total)
  - [ ] M7-MC4 Interrupting mid-detail and then resuming doesn't duplicate or skip that row
  - [ ] M7-MC5 You approve the one-to-many flattening rule per flow
- **Exit:** all four Pattern B flows pass on the mock and in a small live run.

---

### M8 — Safe-Speed & Recovery (Week 7) → milestone M3

**Purpose:** pace politely, slow down before the portal pushes back, recover in graded steps, and never lose collected data.
**Pages:** P-0.1, P-0.4, P-0.5 (signatures), live latency baseline.

| Task | Description | Est. |
|---|---|---|
| M8-T01 | Rate Governor: token bucket, randomised delay, rolling median latency vs baseline, auto slow-down; per-run request counter | 4 h |
| M8-T02 | Recovery Ladder L0–L4: retry → backoff 5/15/45 s with jitter → hard tab reset → 5-min cool-down → pause + desktop notification. Resets on success. | 5 h |
| M8-T03 | Login-wall flow: pause → notify "log in again" → poll for the restored session → re-apply filters from the checkpoint → resume | 4 h |
| M8-T04 | Panel states: Recovering (countdown, attempt n/5, "progress is saved", Retry now) and Login wall | 3 h |
| M8-T05 | CAPTCHA/block detection → immediate pause, with no retry (R8) | 1 h |
| M8-T06 | Timing store: measured per-request times per flow; live time left (D27) | 3 h |

- **Automated (fault-injection suite on the mock):** M8-AT1 429, 5xx, hangs, malformed HTML, session drop. Each one is classified correctly and reaches the correct ladder level · M8-AT2 after any fault sequence, the final dataset equals the fault-free dataset · M8-AT3 the governor slows down when injected latency rises · M8-AT4 CAPTCHA signature → pause, zero retries.
- **Manual:**
  - [ ] M8-MC1 Force a logout mid-run (log out in another tab). The extension pauses and tells you; after you log in, it resumes cleanly.
  - [ ] M8-MC2 Disconnect the network mid-run. It backs off, then recovers, with no data lost.
  - [ ] M8-MC3 Close the browser mid-run. On reopen it offers to resume and does it correctly.
- **Gate G3 (end W7):** M7, M8, full M2 pass → **demo M3 → invoice 40%.**

---

### M9 — Data Check & Reconciliation (Week 8)

**Purpose:** typed, deduplicated, provenance-stamped records, plus an honest reconciliation against the portal's own totals.
**Pages:** none new (uses the stored totals from M6-T03).

| Task | Description | Est. |
|---|---|---|
| M9-T01 | Type coercion: dates (local formats → real dates), BDT amounts → numbers, IDs → text (leading zeros kept), missing → empty (never 0 or "N/A") | 4 h |
| M9-T02 | Dedupe by `row_hash` across overlapping combinations; record a duplicate count | 2 h |
| M9-T03 | Provenance columns: `run_id, combination_id, <filter values…>, source_url, page_no, extracted_at, profile_version, extension_version` | 2 h |
| M9-T04 | Reconciliation: collected vs portal-reported per combination; status `match / mismatch / no-total`; explanations | 4 h |
| M9-T05 | Halt policy: a run with any `SHAPE_CHANGED` exports **nothing** from the affected flow, only the evidence | 1 h |

- **Automated:** M9-AT1 coercion table tests (every format seen in recon) · M9-AT2 dedupe · M9-AT3 a reconciliation mismatch is surfaced, never hidden · M9-AT4 empties stay empty · M9-AT5 halted runs can't be exported.
- **Manual:**
  - [ ] M9-MC1 You review the reconciliation summary of a live small run: zero unexplained gaps
- **Exit:** all AT pass.

---

### M10 — Excel Export (Week 8)

**Purpose:** one `.xlsx` per run, with one sheet and one flat table, plus a reconciliation summary.

| Task | Description | Est. |
|---|---|---|
| M10-T01 | SheetJS writer with typed cells, a frozen header, autofilter, and column widths | 3 h |
| M10-T02 | **Decided, D26: the summary goes on the "About this grab" sheet;** see `docs/samples/`. Was: Reconciliation summary. Decision for you: a second file, or a second sheet? The ToR says "single sheet, single flat table" for the data, so a separate `*-reconciliation.xlsx` or `.html` is safest. | 2 h |
| M10-T03 | Run manifest (JSON) beside the export: profile version, filter config, counts, warnings | 1 h |
| M10-T04 | Row-limit guard (1,048,576) with chunked export | 1 h |
| M10-T05 | File naming `pdms_<flow>_<yyyy-mm-dd_hhmm>.xlsx` via `chrome.downloads` | 1 h |
| M10-T06 | Stop = export what was collected (marked partial); never discard | 1 h |
| M10-T07 | Combine sprints into one workbook: dedupe, whole-run About sheet, row-limit check (D27) | 3 h |

- **Automated:** M10-AT1 golden export test (parse it back, compare cell types and values) · M10-AT2 a 50,000-row file is generated under the time budget · M10-AT3 leading-zero IDs survive the round-trip.
- **Manual:**
  - [ ] M10-MC1 The file opens in Excel with **no repair prompt**
  - [ ] M10-MC2 Sort and filter work; dates sort as dates; amounts sum
  - [ ] M10-MC3 From the provenance columns alone, you can tell where any row came from
- **Exit:** all AT and MC pass.

---

### M11 — Self-Check & Maintenance: Guardian + Dev mode (Week 9) → milestone M4

**Purpose:** refuse to run against a changed page, produce a machine-readable drift report, and give the owner a hidden maintenance screen to apply and roll back configuration repairs.
**Pages:** all fixtures (baseline) plus live preflight on each flow.

| Task | Description | Est. |
|---|---|---|
| M11-T01 | **Preflight**: assert every selector the flow needs on the live page before Start; block with a named reason | 3 h |
| M11-T02 | Fallback-usage tracking ("degraded" vs "broken") | 2 h |
| M11-T03 | Drift detection: current fingerprint vs baseline; cosmetic vs structural | 3 h |
| M11-T04 | **Drift report (Path A)**: zip with failing selectors, sanitised snippets, fingerprint diff, ranked candidate selectors, screenshots, environment info | 5 h |
| M11-T05 | Secret-code gate: 7 clicks on the version → unlabelled input; SHA-256(code+salt); 5 wrong → 15-min lockout; session-only unlock; change code | 3 h |
| M11-T06 | Dev panel: health per flow, full health scan, overrides list | 3 h |
| M11-T07 | **Override layer**: apply a repair (validated against the schema and the live page), audit entry, **one-click rollback** | 4 h |
| M11-T08 | *(Conditional on X6 consent)* Path B AI-assisted repair: key held in memory only; only sanitised fragments sent; diff + live test; explicit approval | 5 h |
| M11-T09 | `tools/hash-code` to generate the salted hash. You supply the code privately (Q7). | 0.5 h |

- **Automated:** M11-AT1 **deliberately break a selector in a fixture → preflight blocks the run and names it** · M11-AT2 the drift report validates against its schema · M11-AT3 override apply/rollback round-trip · M11-AT4 a wrong code produces no UI change; lockout after 5 · M11-AT5 the drift report contains no token or PII (sanitiser test).
- **Manual:**
  - [ ] M11-MC1 The secret code opens the Dev panel; a wrong code does nothing visible
  - [ ] M11-MC2 With a selector broken in the override layer, preflight blocks the run and explains why
  - [ ] M11-MC3 The drift report exports, and Claude can act on it (round-trip test: Claude patches from the report alone)
  - [ ] M11-MC4 A bad override rolls back in one click
  - [ ] M11-MC5 The Dev panel offers both paths, and you can choose one (Path B only if X6 is cleared)
- **Gate G4 (end W9):** M9, M10, M11, M12 pass → **demo M4.**

---

### M12 — Activity Log & Audit (Week 3 skeleton, Week 9 final)

**Purpose:** a readable record of every run, plus an audit trail of configuration changes.

| Task | Description | Est. |
|---|---|---|
| M12-T01 | Log levels and events: run start/end, combination start/end, page outcome, recovery steps, downgrades, warnings | 2 h |
| M12-T02 | Activity log in the panel (collapsed by default), live tail | 2 h |
| M12-T03 | Export a run log as `.json` and `.txt` | 1 h |
| M12-T04 | Audit log for override apply/rollback and code changes | 1 h |
| M12-T05 | Retention: purge runs older than N days (configurable); never log credentials or cookie values | 1 h |

- **Automated:** M12-AT1 every state transition emits a log event · M12-AT2 the log contains no password, token or cookie value (scan test).
- **Manual:**
  - [ ] M12-MC1 From the log alone, you can explain what happened during the M8 fault demos
- **Exit:** AT pass.

---

### M13 — Side Panel UI (Weeks 4–5 core, Weeks 8–9 polish)

**Purpose:** PROJECT_PLAN §5 realised: one surface that always answers *what is it doing / how far / what next*.

| Task | Description | Est. |
|---|---|---|
| M13-T01 | Design tokens (light and dark), Inter + system fallback, 8 px grid, tabular numerals | 2 h |
| M13-T02 | Header status pill; flow picker; page-match line | 2 h |
| M13-T03 | Filter card (from M3), Plan card (≈ estimate, Start with a disabled reason) | 3 h |
| M13-T04 | Running card: progress `17/≈42`, current branch in plain words, rows / rate / elapsed, Pause / Stop | 4 h |
| M13-T05 | Recovering, Login-wall, Halted (shape changed), and Done states | 4 h |
| M13-T06 | Accessibility: keyboard, focus rings, ARIA live region, contrast ≥ 4.5:1 | 3 h |
| M13-T07 | Resume-offer dialog after a restart | 1 h |
| M13-T08 | Estimate card: count request, time range, warning levels, Start confirmation (D27) | 4 h |
| M13-T09 | Ways to shorten a run, each with a computed time (D27) | 3 h |
| M13-T10 | Sprint planner and sprint list (D27) | 5 h |
| M13-T11 | Checkerboard of detail fields, shown before Start (D25) | 3 h |

- **Automated:** M13-AT1 component tests per state · M13-AT2 automated a11y check (axe) on every state · M13-AT3 no layout shift during a simulated run.
- **Manual:**
  - [ ] M13-MC1 You can read every state at a glance without asking Claude
  - [ ] M13-MC2 Pause, Resume and Stop do exactly what they say
  - [ ] M13-MC3 Nothing flickers during a run
  - [ ] M13-MC4 It looks right in light and in dark
  - [ ] M13-MC5 The whole flow works with the keyboard only
- **Exit:** AT and MC pass.

---

### M14 — Testing, Documentation, Training & Handover (Week 10, drafted throughout) → milestone M5

**Purpose:** close every contractual deliverable (ToR §6, Proposal §3).

| Task | Description | Est. |
|---|---|---|
| M14-T01 | **Full-scale live runs** of all five flows with realistic "All" selections, watched by you; performance notes | 8 h (mostly waiting) |
| M14-T02 | `docs/TEST-REPORT.md`: every ToR requirement → test evidence → pass/fail, **including the interruption test and the structural-change test** (Proposal §3) | 4 h |
| M14-T03 | `docs/USER-GUIDE.md` / installation guide (Windows, unpacked load, daily use) | 3 h |
| M14-T04 | `docs/SITE-PROFILE.md`: field-by-field configuration reference | 3 h |
| M14-T05 | `docs/MAINTENANCE.md`: Dev mode, drift report, apply/rollback, monthly health scan | 2 h |
| M14-T06 | `docs/OPERATIONS.md`, `README.md`, `CHANGELOG-PROFILE.md` | 2 h |
| M14-T07 | **Fresh-machine test**: clone → load unpacked on a **PWD workstation** → run | 2 h |
| M14-T08 | Confidentiality close-out: hand over or wipe `recon/raw/`, test exports and recordings; record it in writing | 1 h |
| M14-T09 | Training session for the PWD officer (normal run, resume, maintenance mode), with a printed one-page quick guide | 2 h |
| M14-T10 | UAT protocol execution and sign-off form (see §8.4); tag `v1.0.0`; hand over the repo to the PWD-nominated location | 2 h |

- **Manual:**
  - [ ] M14-MC1 You ran a full sprint on every flow yourself, without Claude
  - [ ] M14-MC2 The docs answered your questions without asking Claude
  - [ ] M14-MC3 The extension loads on a fresh PWD machine from the repo alone
  - [ ] M14-MC4 The PWD officer signs the UAT sheet
- **Gate G5 (end W10):** all ToR §11 criteria witnessed → **invoice 50%**, warranty starts.

---

## 8. Test strategy

### 8.1 Layers

| Layer | Tool | What it covers | Runs | Owner |
|---|---|---|---|---|
| Static | ESLint, `checkJs`, custom selector-ban rule | Code hygiene, no hard-coded site knowledge | every commit | Claude |
| Unit | Vitest | Planner, IDs, hashing, coercion, state machine, governor, ladder | every commit | Claude |
| Golden | Vitest + fixtures | Parsers (filters, tables, details), merge, export round-trip | every commit | Claude |
| Integration / E2E | Playwright + mock eGP server + real unpacked extension | Full sprints, kill-and-resume, tab leaks, fault injection, preflight | daily / before every demo | Claude |
| Live smoke | You + Claude over CDP | Small-selection runs on the real portal | at the end of each module | You |
| UAT | PWD officer | ToR §11 acceptance, witnessed | M5 | PWD |

### 8.2 The mock eGP server is the main test bed

- It replays the sanitised fixtures and emulates cascades, pagination, empty results, detail pages, latency, 429/5xx, hangs, session drops and changed markup.
- **Rule:** no feature reaches the live portal before it passes on the mock.

### 8.3 Signature tests (run before every milestone demo)

| Test | Proves | ToR link |
|---|---|---|
| **Kill-and-resume ×50** (M5-AT1, M7-AT4) | No loss or duplication under interruption | §11.2, Spec 5 |
| **Cascade spy** (M4-AT2) | Progressive discovery, not a pre-computed list | Spec 3, §2.2 |
| **Broken-selector preflight** (M11-AT1) | Refuses to run, names what's missing | §11.3, Spec 12 |
| **Shape-changed halt** (M2-AT2, M6-AT3, M9-AT5) | Fails loud and doesn't export | Spec 9 |
| **Fault-injection parity** (M8-AT2) | Recovery yields the same data as a clean run | Spec 6–8 |
| **Leak test** (M7-AT2) | 200 details, zero tabs left open | Pattern B |

### 8.4 UAT protocol (Week 10, witnessed by the PWD officer)

| # | Scenario | Pass condition |
|---|---|---|
| U1 | Install from the repo on a PWD workstation | Loads with no errors |
| U2 | Flow 1: real run with one filter on "All" | Excel opens cleanly; reconciliation shows a match |
| U3 | One Pattern B flow: real run | Detail fields are present; 5-row spot check matches |
| U4 | **Interruption:** close Chrome mid-run, reopen, resume | Final row count equals a clean run's; zero duplicates |
| U5 | **Session expiry:** log out mid-run | Pause → re-login → auto-resume |
| U6 | **Structural change:** a broken selector is applied via override | Preflight refuses and names it; no export |
| U7 | Maintenance mode: code → drift report → rollback | All three work |
| U8 | User guide + training | The officer runs U2 alone |

Each UAT result goes into `TEST-REPORT.md` with date, witness and evidence (screenshot or file hash).

---

## 9. Requirements traceability

| ToR requirement | Module(s) | Automated evidence | Manual / UAT evidence |
|---|---|---|---|
| §3.1 No credentials, no bypass, no server | M0, M12 | M0-AT5, M12-AT2, manifest review | M0-MC4 |
| §3.2 Five flows, Pattern A/B | M1, M6, M7 | M6-AT1, M7-AT3 | M6-MC1–3, M7-MC3 |
| §4 Filter Setup | M3, M13 | M3-AT1–4 | M3-MC1–3 (G1) |
| §4 Auto-Combination (cascade) | M4 | M4-AT1–5 | M4-MC1 |
| §4 List Data Collection | M6 | M6-AT1–5 | M6-MC1–2 |
| §4 Detail Data Collection | M7 | M7-AT1–5 | M7-MC1–4 |
| §4 Save & resume | M5, M7 | M5-AT1, M5-AT3, M7-AT4 | M5-MC1–2, M8-MC3, U4 |
| §4 Safe-Speed & Recovery, login | M8, M2 | M8-AT1–4 | M8-MC1–2, U5 |
| §4 Data Check & Reconciliation | M9 | M9-AT1–5 | M9-MC1, U2 |
| §4 Excel Export | M10 | M10-AT1–3 | M10-MC1–3 |
| §4 Self-Check & Maintenance | M11, M2 | M11-AT1–5, M2-AT2 | M11-MC1–5, U6–U7 |
| §4 Activity Log | M12 | M12-AT1–2 | M12-MC1 |
| §5 Configuration file external | M1, M0-T06 | M0-AT4, M1-AT1, M1-AT5 | Code review |
| §6 Deliverables | M14 | — | M14-MC1–4 |
| §10 Testing incl. stop/restart | M5, M14 | §8.3 suite | U4 |
| §11 Acceptance 1–5 | all | §8.3 suite | U1–U8 |
| §14 Confidentiality | M1-T07, M14-T08 | M1-AT3, M11-AT5 | M1-MC5, M14-T08 record |

---

## 10. Execution risk register

These risks are about schedule and delivery. Product risks are in PROJECT_PLAN §7.6.

| # | Risk | Likelihood | Impact | Mitigation | Trigger → response |
|---|---|---|---|---|---|
| E1 | Portal access isn't ready in Week 1 (X5) | Med | High | Ask PWD now. Do M0 and the schema in the meantime. | No access by W1 Day 3 → shift all milestones one week, in writing |
| E2 | A flow is a JS SPA or uses unusual postbacks | Med | Med | The recon checklist identifies it early; the UI path still works | +3–5 days per flow, taken from contingency |
| E3 | Tender Info detail is heavier than assumed (X3) | Med | Med | Recon R3 in W2; the detail engine is shared | Re-estimate M7 at the end of W2 |
| E4 | Throttling or CAPTCHA under full-scale runs | Low–Med | High | Governor; small-scale testing; full runs only in W10 | Pause; escalate as a policy question with PWD. No bypass. |
| E5 | The portal changes mid-project | Low | Med | Fixtures + Guardian; re-recon the affected flow | Refresh fixtures; minor profile bump |
| E6 | PWD feedback is slow | Med | Med | Proposal §9: 5-working-day deemed acceptance | Log the dates; continue to the next phase |
| E7 | Scope creep (extra fields, attachments, new reports) | Med | Med | ToR §19 change control | Written quotation before any work |
| E8 | Natural keys are ambiguous, so dedupe is wrong | Med | High | Decide with you at M1-MC3; reconciliation catches it | Re-key and re-run the golden tests |
| E9 | MV3 service-worker lifetime quirks | Med | Med | Persist-before-ack; alarms; kill tests | M5-AT1 must be 50/50 before G2 |
| E10 | Single-person bandwidth (you) | Med | Med | Recon front-loaded; Claude carries the build | Use contingency weeks; don't compress testing |

---

## 11. Handover & warranty

**At M5 (Proposal §3 deliverables checklist)**

- [ ] Working extension, demonstrated on a PWD workstation against the live portal
- [ ] Source code with full Git history, in the PWD-nominated repository
- [ ] Site configuration file `profiles/eprocure.gov.bd.json` (versioned) + `schema.json`
- [ ] Test fixtures (sanitised) + mock server
- [ ] Sample output: at least one complete live workbook + its reconciliation summary
- [ ] `TEST-REPORT.md` with every ToR requirement marked, including the interruption and structural-change tests
- [ ] Installation / user guide
- [ ] Configuration reference (`SITE-PROFILE.md`)
- [ ] Maintenance guide (`MAINTENANCE.md`)
- [ ] Training delivered; attendance noted
- [ ] Confidentiality close-out note (raw captures wiped or handed over)
- [ ] Secret code handed to the PWD officer **in person or sealed**, never in the repo

**During the warranty (~8 Jan – ~7 Apr 2027)**

| Activity | Cadence |
|---|---|
| Monthly health scan (Dev → Run full health scan) with the PWD officer | Monthly: early Feb, early Mar, early Apr |
| Drift report → profile patch → fixture refresh → golden tests → `CHANGELOG-PROFILE.md` | On demand |
| Response targets: won't run = same day; defect = acknowledged in 1 working day, fixed in 3; query = 2 working days | Per Proposal §4.3 |
| Warranty-close note; final 10% invoice | ~Apr 2027 |

Anything beyond configuration-level repair, or any new flow or field, is chargeable under Proposal §4.2 and ToR §19 and needs a written quotation first.

---

## 12. Progress log

Append one line per working block. Demo and feedback dates matter contractually (Proposal §9).

| Date | Week | Tasks touched | Result | Notes |
|---|---|---|---|---|
| 2026-10-28 | 0 | Planning | Execution plan v1.0 written | Pending: X1, X2, X4, X5, X6 |
| 2026-11-04 | 1 | X1, X4–X7 | Pre-start items resolved; see §1 status table | Owner is a PWD employee with permission: no note to PWD. X2 open: the GitHub repo is public. |
| 2026-11-04 | 1 | M0-T02…T08 | M0 built. `npm run verify` green: lint, type-check, 34/34 unit tests, build. E2E smoke 1/1 passes. | Added README (two-PC setup and daily routine), CLAUDE.md, `.gitattributes` (LF everywhere), `.nvmrc`. Next: you tick M0-MC1–MC4, then R0. |
| 2026-11-04 | 1 | X2, M0-T01 | Repo made private. First commit `01fb551` made locally. The owner pushes it (Claude's push was blocked by permissions). | `npm run chrome` failed: PowerShell execution policy blocks `npm.ps1`. Fix added to the README: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or use `npm.cmd`. |
| 2026-11-04 | 1 | M0-T01, R0, M1-T02 | Both commits pushed; repo public by the owner's choice; Claude now commits and pushes. **R0 done:** CDP link to Chrome 156. **R1 started:** JSP site; post-login mobile/NID interstitial found; global nav mapped. | Notes in `docs/recon/00-portal-shell.md`. |
| 2026-11-04 | 1 | M1-T02 | R1: dashboard (Message Box) captured; Reports menu mapped; **Flow 1 = `/report/ProcTransReport.jsp`** | Two APP candidates; waiting for the owner to map each flow to a page. |
| 2026-11-04 | 1 | M1-T03 | **R2 Flow 1 mostly mapped:** 6 filters, dependency graph (FY→Quarter client-side; Office+Budget→Project and Programme→Project by XHR), Generate = plain form POST (fast path possible), aggregate 18-column table with no paging; Total row is the reconciliation check. **D11: Flows 2–5 run logged out, Flow 1 logged in.** Recorder now saves continuously. | Notes in `docs/recon/flow-1.md`. Needs a non-empty result, and the owner's answer on which filters to iterate. |
| 2026-11-04 | 1 | M1-T03, M3, M4 | **Flow 1 scope narrowed by the client:** pick a Financial Year, plus one PE Office or All (loop every office). Quarter is fixed to All Four; Programme, Project and Budget Type are not used. | Pending: verify that Budget Type unselected returns all budgets; one non-empty capture. |
| 2026-11-04 | 1 | M1-T03 | **R2 Flow 1 done.** Panel = Financial Year + PE Office only; other page filters never touched. Budget Type unselected returns 3 tables (Development, Revenue, Own Fund) + GRAND TOTAL; hand-reconciled. Cols 15–18 are filled by in-page JS, so the parser computes them. | Fixture commit waits for the sanitiser (M1-T07). Next: logout + login capture, then R3–R6 logged out. |
| 2026-11-04 | 1 | — | End of day on the home PC. Handover written in §13 "Resume here". | Continue on the office PC with R3 (Flow 2, logged out). |
| 2026-11-04 | 1 | — | Next-session plan (steps 0–9) written into §13; valid on either PC. | Target: R3–R6 done by ~Tue 10 Nov; M3 Wed–Thu; demo M1 Thu 12 Nov. |
| 2026-11-04 | 1 | Step 0, M0-T07 | **Second PC set up:** `npm ci` + `npm run verify` green (lint, type-check, 34/34, build). Added `start-dev-chrome.bat` (double-click: rebuild `dist/`, then launch the controlled Chrome) and a `-WithExtension` switch on `launch-chrome.ps1`, so one window serves both recon and extension testing. | `.gitattributes`: `*.bat`/`*.cmd` are CRLF. Next: re-walk Flow 1 with the owner (verification pass + the logged-in non-empty capture, step 7), then R3. |
| 2026-11-05 | 1 | Steps 1–2, M1-T02 | Link-up on the home PC, logged out. **P-0.1 captured:** the login form lives on the homepage (`#txtEmailId`, `#txtPassword`, `#btnLogin`). Flow 1 re-walk skipped; its raw captures are on this PC. | Next: R3 Flow 2. |
| 2026-11-05 | 1 | M1-T04 | **R3 Flow 2 started (logged out). Client: all filters kept.** 13 filters read; Department tree → Procuring Entity is the only cascade; list = POST `/TenderDetailsServlet` returning an HTML fragment; detail = POST `/resources/common/ViewTender.jsp` with the tender ID. | Notes in `docs/recon/flow-2.md`. Recorder missed the department calls; to check on the next Search. |
| 2026-11-05 | 1 | M1-T04, M0-T08 | Filtered search captured (PWD + Mymensingh division, 2 pages). **D12: "All" = blank, one sweep through pages; no looping of filter values in Flow 2.** Recorder fault found: capture stopped after first page load; `watch` now reports `LINK LOST`. | Cause still unknown. Next: last page, detail page, empty result. |
| 2026-11-05 | 1 | M1-T04, M7, M13 | **Notice page read:** ~45 fields + lots table, located by label text. **Owner adds:** Status dropdown default All; a **field palette** choosing which notice fields to collect, looping every notice page. Last page confirmed (19 tenders over 2 pages). | Scope addition for M7 and M13. Next: list after the detail closes, All-tab volume, empty result, multi-lot sample. |
| 2026-11-05 | 1 | M1-T04 | List stays on its page after the notice tab closes. **Volume measured: All tab, no filters = 63,889 pages (≈639,000 tenders)**, ~130× the contract scale. Tender ID `1` is a real 2011 tender with status "Contract Awarded". | Waiting for the owner's decision on a volume guard. Next: empty result, Service notice, multi-lot notice. |
| 2026-11-05 | 1 | M1-T04, M3 | **D13:** mandatory date window of at most 3 years (owner's idea). **D14:** one row per tender; no multi-lot tenders exist yet. | Next: measure a 3-year window; empty result; Service notice. |
| 2026-11-05 | 1 | M1-T04, M3 | **D13 extended: Department mandatory too.** PWD + 3-year window = 2,274 pages ≈ 22,700 tenders (≈19 h with notices). Empty result captured. REOI notice captured: labels and lots table differ by event type, so the palette maps one field from several labels. | End of day on the home PC. D13 details await confirmation. Resume: finish R3, then R4. |
| 2026-11-05 | 1 | — | Handover notes for the office PC added to `CLAUDE.md`: working style and recon traps. | Resume at §13 "Start next session here". |
| 2026-11-05 | 1 | M1-T04, M3, M13 | **D13 confirmed and revised by the owner:** span **5 years** (was 3), window on Publishing dates, each date box gets a **"current date" checkbox ticked by default** so an unset end means today. Department stays mandatory, ID/Reference searches exempt from the window. | Second PC up to date (`npm run verify` green). Next: Category tree (`loadCPVTree`) closes R3, then R4 Flow 3 APP Info. |
| 2026-11-05 | 1 | M1-T04 | **R3 Flow 2 done.** Category tree captured: popup `CPVTree.jsp`, 61 root categories in the initial HTML, children from `/GetCpvTree?id=…`, ticked nodes expanded by `/GetCpvTree?action=getChildData&cpvdesc=…`. The filter value is a `;`-separated list of category **names**, not codes: one root ("Construction work") = 27 names, 1,085 characters. Names can contain `;`, so the value must never be re-split. | The panel builds its own picker from the same endpoints. Next: R4 Flow 3 APP Info, logged out. |
| 2026-11-05 | 1 | M1-T04 | **R4 Flow 3 started.** `AdvAPPSearch.jsp` read from its own code in one snapshot: 11 filters including the project's first **numeric comparison** filter (operator + value/value2), two cascades (`/ComboServlet` for office; `/APPServlet getAppProjectAdv` for project, repeating the Flow 1 budget-vocabulary trap), `POST /SearchServlet action=Search` returning an HTML fragment with the same body for page 1 and page N, and a **directly buildable** detail URL `ViewPackageDetail.jsp?appId=&pkgId=`. | **No filter is mandatory** (`chkMinistry`'s checks are commented out), so unfiltered = 17,391 pages ≈ 174,000 rows: the guard must be ours, and this page has no date filter. Four result columns pack two fields into one cell. List is already package-level, so the natural key is (appId, pkgId). Notes in `docs/recon/flow-3.md`. |
| 2026-11-05 | 1 | M1-T04, M7, M13 | **R4 Flow 3 done.** Package detail read: ~35 fields in four sections, eight `dd-MMM-yyyy` dates, a Lot Details table. Both cascades confirmed on the wire (`/ComboServlet`, `/APPServlet`) plus `/SearchServlet`; **`totalPages` arrives inside the response fragment**. Measured PWD + FY 2024-2025 = **1,841 pages ≈ 18,400 packages** (≈1.5 h list, ≈15 h with details). Empty result captured. **Owner's scope: D15, D16, D17.** | Two cautions: the detail's `Procuring Entity` is a *person's* name (out of the palette by default, sanitiser must strip it), and on an empty result `totalPages` is left **stale**, so emptiness is detected by `#noRecordFound` only. Flow 2's recorder gap is closed: the recorder is sound, the earlier miss was a stale attachment. |
| 2026-11-05 | 1 | — | Owner moves to the home PC. Handover prompt and next-session plan written into §13. | Remaining: `size` experiment, R5 Flow 4, R6 Flow 5, the logged-in Flow 1 fixture, then step 8 build work. |
| 2026-11-05 | 1 | M3 | Back on the home PC at `628b676`. **Owner's idea for filters, proposed as D18:** scan live, apply each change to the real page, rescan all; a thin profile only names each filter. | Awaiting the owner's answer. Page-size test on Flow 3 in progress. |
| 2026-11-05 | 1 | M1-T04, M3, M6-T02 | **D18 accepted by the owner.** **Page size: `/SearchServlet` honours `size=50`** (50 rows, 412 pages for PWD FY 2025-2026). APP ID is not unique: 16 distinct in 50 rows. | Next: largest allowed size and a completeness check. Flow 2's servlet still untested. |
| 2026-11-05 | 1 | M1-T04, M6-T02, M8 | **Page size verified on `/SearchServlet`:** sizes 50 and 100 give the same 173,904 packages and identical leading rows. Size 100 is the default. Deep pages take ~2.3 s against ~0.2 s, which M8 must not read as throttling. Corrected: 17,391 pages is the preselected year, not "no filter". | Next: same test on Flow 2's `/TenderDetailsServlet`. |
| 2026-11-05 | 1 | M1-T04, M6, M9 | **`/TenderDetailsServlet` honours size 100:** totals match at both sizes (Service 639, Goods 192,186, Works 444,303; the owner's idea to test the big ones). **Finding: row order is unstable among equal timestamps**, so a sweep could lose rows. Safeguard: distinct IDs must equal the computed total. | Next: full sweep of Service at size 100 to test for loss. |
| 2026-11-05 | 1 | M1-T04, M6, M9 | **Proven: a list sweep loses rows.** Service, 639 tenders: size 10 lost 7, size 100 lost 1; the union of both is exactly 639. Cause: the sort has no tie-break on equal timestamps. Not uploads: the total held for 430 s. | Fix options in `flow-2.md`; settle in M6. Next: R5 Flow 4. |
| 2026-11-05 | 1 | M1-T04 | **`docs/INSIGHTS.md` created** at the owner's request: 40 findings and ideas across flows. **R5 Flow 4 started:** 16 filters, list POST `/AdvSearchNOAServlet`, 89,586 pages (≈896,000 contracts), detail buildable from the row; all from one snapshot. | Notes in `docs/recon/flow-4.md`. Next: owner's scope; see Search, size and detail on the wire. |
| 2026-11-05 | 1 | M1-T04 | **D19:** Flow 4 keeps all 16 filters; Department + 5-year Contract Sign Date window mandatory; palette starts empty. PWD + window = 7,119 pages ≈ 71,200 contracts. Contract detail read: ~25 fields + ownership table. | Next: size 100, window exclusions, empty result. |
| 2026-11-05 | 1 | M1-T04 | Flow 4: **size 100 verified**, 71,190 contracts at both sizes. Empty result captured. | Not measured: PWD with no window; the request went out with Department cleared. Retest pending. |
| 2026-11-05 | 1 | M1-T04 | **R5 Flow 4 done.** Sign-date window hides almost nothing: 13,335 pages with no window or a very wide one (PWD). Beneficial Ownership stays out of the palette. | Next: R6 Flow 5. Full-sweep test on Flows 3 and 4 during M6. |
| 2026-11-05 | 1 | M1-T04, M3 | **R6 Flow 5 started:** 13 filters, 15,931 pages (eTenders only). **D20:** Department + 5-year Contract Start Date window. **D21:** a contractor filter lifts both requirements on Flows 4 and 5. Search forces size to 10 on this page. | Notes in `docs/recon/flow-5.md`. Testing broad entries against D21. |
| 2026-11-05 | 1 | M1-T04, M3 | **D21 tested on Flow 5:** a name gives 1–39 pages; `Construction` 1,922; `a` 15,491 of 18,735. Proposed: the exemption holds only up to 5,000 rows. Owner: Tender Type dropdown default All; palette empty; Experience Certificate No is not a contractor filter. | Awaiting the owner on the limit. Next: PWD volume, window check, size 100, detail, empty. |
| 2026-11-05 | 1 | M1-T04 | **R6 Flow 5 done, so all five flows are mapped logged out.** Size 100 verified: 8,377 at both sizes. Window hides nothing visible. **D22:** the exemption holds up to 5,000 rows. | **New, owner's request: R7 audit of Flows 2–5 logged in**, for anything extra compared with logged out. |
| 2026-11-05 | 1 | R7, D11 | **R7 audit, Flow 2: same request, logged in returns 5,733 pages against 2,274 logged out**, including "Being processed" tenders. Public notice identical; filters same; Department locked. | D11 needs the owner's review. Notes in `docs/recon/r7-logged-in-audit.md`. |
| 2026-11-05 | 1 | R7 | A "Being processed" notice opens fully when logged in: same fields, but no status row and no Documents link. | To check logged out. Next: Flow 3 logged in. |
| 2026-11-05 | 1 | R7 | **Flow 3 logged in: nothing extra.** 1,841 pages both ways, Department not locked, same detail labels. | Next: Flow 4 logged in. |
| 2026-11-06 | 1 | R7, M0-T08 | **Claude's fault, fixed:** stopped recorders kept running through a login. No credentials captured; two account pages stored and wiped. New `recon stop`; private pages never recorded; email, mobile and NID redacted; 2 new tests. **Correction to R7:** the requests differ in `office` (`""` against `" "`) and "Being processed" appears both ways, so the cause of 5,733 against 2,274 is open. eContracts doesn't log out; session ended at midnight. | Next: test the space. Owner: repeat the search Sunday morning and night. |
| 2026-11-06 | 1 | R7 | **Space test: logged in with the space still gives 5,733, so the space is not the cause.** Test plan T1–T9 written in `r7-logged-in-audit.md`. | Next: T2, full sweep of one small office both ways. |
| 2026-11-06 | 1 | R7 | **Likely reason for the gap: logged-out Flow 2 hides LTM tenders.** Mymensingh: logged in OTM 473 + LTM 277 = 750; logged out exactly 473. On the sampled page, all 8 hidden are LTM and both shared are OTM; none of 961 logged-out rows is LTM. | §13 rewritten: confirm, finish the audit, owner decides, then stop recon and build. |
| 2026-11-06 | 1 | R7 | **LTM confirmed logged out:** Method = LTM gives no records, against 277 logged in for the same office. | Next: logged in, OTM should give 2,274; Flows 4 and 5 same search. |
| 2026-11-06 | 1 | R7 | **Audit answered.** Logged in OTM = 2,272 pages against 2,274 public, so the gap is LTM. Flow 4 7,119 and Flow 5 1,578 are the same both ways. **Only Flow 2 differs.** | Owner's LTM decision next, then build. |
| 2026-11-06 | 1 | R7, M10 | **D23:** Flow 2 runs in whichever login state the user is in; the panel warns before a logged-out run that LTM is off limits and to log in to add it. **Demo output** `docs/samples/PDMS_output_demo.xlsx`: all five flows and a run report, made-up data. | Awaiting the owner's review of the demo. Next: build. |
| 2026-11-06 | 1 | M7, M10, M13 | **Owner's output guidelines: D24 purpose, D25 detail data is the main purpose with a checkerboard before Start, D26 About + Data sheets with Filter columns.** Demo rebuilt: five files in `docs/samples/`, made-up data. | Departs from the ToR's single sheet; accepted by the owner (D28). Owner reviews tomorrow. Next: one pre-build check, then build. |
| 2026-11-06 | 1 | M8, M10, M13 | Owner reviewed the five demo workbooks: **"better now"**. **D27: time estimate before every flow; over 6 hours warns; over 24 hours unrealistic; ways to shorten; sprints of at most 6 hours.** Design in `docs/TIME_ESTIMATE.md`, 5 new tasks added. All documents brought up to date, including §0a. | End of day on the home PC. Next: §13 step 3a, then build. |
| 2026-11-06 | 1 | All | **D28: the owner holds ToR authority; Claude warns of every deviation.** ToR "single sheet" change accepted. | Standing rule, in `CLAUDE.md`. |
| 2026-11-06 | 1 | M7, M10 | **D29: LTM tenders are collected and exported** (logged in, own department only). | Next: §13 step 3a. |
| 2026-11-06 | 1 | M13 | **D30:** logged-out Flow 2 begins, before any filter, with a Proceed choice: no LTM here; logging in can give both LTM and OTM. | Timing confirmed by the owner. |
| 2026-11-06 | 1 | M0-T08, §13 3a | `snapshot` writes page text first; its screenshot is optional after 8 s, following one 2-minute hang; `stop` also ends a stuck snapshot. ID check: a Tenderer ID from a contract awarded this week gave no Flow 5 rows, which proves nothing, since a new contract may have no experience record yet. | Retrying the other way: from a Flow 5 row to its contract. |
| 2026-11-06 | 1 | §13 3a, M7 | **Flow 4 detail has two layouts:** older contracts lack Tenderer ID and have other fields. Completed Flow 5 work is on Flow 4 (tender 907857, same value). Completed Flow 5 detail: same 28 labels. | Still to answer: Tenderer ID = Company Unique ID, on a newer contract; ongoing work on Flow 4. |

**Milestone record**

| Milestone | Demo date | Witness | Feedback received | Accepted | Invoice |
|---|---|---|---|---|---|
| M1 | | | | | — |
| M2 | | | | | — |
| M3 | | | | | 40% |
| M4 | | | | | — |
| M5 | | | | | 50% |
| Warranty close | | | | | 10% |

---

## 13. Immediate next steps (this week)

### ▶ Resume here (updated 2026-11-06, end of day, home PC; valid on either PC)

**Where we are.** All five report pages are mapped logged out. Decisions D11–D29 are in `PROJECT_PLAN.md` §8; findings are in `docs/INSIGHTS.md`; per-flow notes are in `docs/recon/`. **Nothing beyond M0 is built:** no `profiles/`, no filter panel, no extraction. **The M1 demo is Thu 12 Nov.** Fri and Sat are holidays, so about 4 working days are left.

**Do these in order:**

| # | Task | Who | Time |
|---|---|---|---|
| 1 | [x] **LTM confirmed** (R7, T1): logged out LTM gives no records; logged in OTM 2,272 against 2,274 public | done | |
| 2 | [x] **Audit done:** Flows 3, 4, 5 give the same counts both ways; only Flow 2 differs | done | |
| 3 | [x] **Decided: D23–D27.** Demos reviewed by the owner: "better now". **D29: LTM tenders are collected and exported.** | done | |
| 3a | **The one check before building** (owner wants only the most important): the detail pages, because D25 makes them the main purpose. Open one PQ, one RFP or PPS notice (Flow 2) and one completed record (Flow 5), read their fields. In the same session, take one contractor from Flow 4's detail and search their Tenderer ID in Flow 5's Company Unique ID: same number? | owner clicks | 10 min |
| 4 | **Stop recon. Build:** `profiles/schema.json` (M1-T01), profile fragments per flow, fixture sanitiser (M1-T07), mock server (M1-T08) | Claude | no browser |
| 5 | **M3 live filters** (D18): what the M1 demo actually shows, on all five pages | Claude, then owner checks | |
| 6 | **M0 checks still unticked:** M0-MC1, MC2 (load `dist/`, panel says Ready), MC4 (`git status` clean). Owner: tomorrow | owner | 2 min |

**Dated checks that don't block the build:**
- **Sunday 8 Nov, morning and night** (owner's request): PWD + 01/01/2023–31/12/2025, logged out and logged in. How fast do counts move on a working day?
- **Any night:** stay logged in across 12:00. Was the midnight logout a reset, or chance?

**Moved to M6, not recon:** the full-sweep row loss (`flow-2.md`), including trying one big `size` and date windows, and sweeps on Flows 3–5.

**Optional inspections, not before building (owner, 2026-11-06):** Sunday and midnight checks; session idle timeout, logout page and cookie name (R1, needs a login, due by M8); the hidden cell in the Flow 2 lots table (from captures); Flow 3 package detail fixture, whose raw copy is on the office PC.

**Open owner decisions:** Q7 secret code, by Week 9 · natural keys, proposed: Flow 2 Tender ID, Flow 3 package ID, Flow 4 `pkgLotId`, Flow 5 certificate number or `Id`.

**Recorder note:** `watch` caught 0 requests twice on 2026-11-06, once on the wrong tab (DevTools) and once on the right one, cause unknown. Tab numbers shift, so check `tabs` each time. `snapshot` reads rows straight from the page and hasn't failed. Run `npm run recon -- stop` before any login.

**First-time setup on a new PC:** see `README.md`. Raw captures in `recon/raw/` never travel between PCs; fixtures must be recaptured or built on the PC that holds them.

### Checklist

1. [x] ~~X1: ignore rule for the credentials file.~~ Done 2026-11-04.
2. [x] ~~Repo visibility (X2) and first push.~~ Public by the owner's choice; pushed.
3. [x] ~~Note to PWD.~~ Not needed: the owner is a PWD employee with permission.
4. [ ] **You:** pick the secret code privately (Q7). It's needed only by Week 9.
5. [x] ~~**Claude:** M0-T02 … M0-T08.~~ Done 2026-11-04.
6. [ ] **You:** M0-MC1, MC2 (load `dist/` unpacked, open the panel → "Ready"), MC4 (`git status` clean). MC3 done.
7. [~] **Together:** R0 ✓ → R1 partly (session expiry, logout page and cookie name left) → R2–R6 ✓ → R7 audit in progress.
8. [ ] Build the profile and M3 live filters on all five pages → **demo M1 on Thu 12 Nov 2026.**

---

## Appendix A — Glossary

| Term | Meaning |
|---|---|
| Flow | One of the five report pages |
| Sprint / Run | One full execution of a flow with one filter configuration; produces one `.xlsx` |
| Combination | One concrete set of filter values inside a sprint |
| Site Profile | The versioned JSON holding every URL, selector, column mapping and page rule |
| Fixture | A sanitised saved HTML snapshot of a page state, used for offline tests and the drift baseline |
| Mock server | Local server that replays fixtures to imitate eGP |
| Sentinel | Classifier that labels every page outcome |
| Recovery ladder | Escalating responses L0–L4 to repeated failures |
| Preflight | Pre-run check that every needed element exists |
| Drift report | Machine-readable evidence of what changed on the portal |
| Override layer | Repairs applied from Dev mode on top of the shipped profile; one-click rollback |
| Natural key | Columns that uniquely identify a record, used for `row_hash` dedupe |
| CDP | Chrome DevTools Protocol, used only during recon, with you driving |
