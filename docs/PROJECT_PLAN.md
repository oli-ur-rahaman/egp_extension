# eGP Data Extraction Extension — Master Plan

**Project codename:** `egp_ext`
**Target portal:** Bangladesh e-GP — `https://www.eprocure.gov.bd`
**Artifact:** Unpacked Chrome MV3 extension (private distribution, never published to Chrome Web Store)
**Document status:** v0.1 — Plan of record. Supersedes verbal scope.
**Last updated:** 2026-09-09

---

## 0. How to read this document

| Section | Answers |
|---|---|
| [1. Scope](#1-scope-of-work) | What we are building, and explicitly what we are not |
| [2. Discovery](#2-discovery-plan--how-i-learn-the-pages) | How I learn the site, page by page, with you driving |
| [3. Architecture](#3-system-architecture) | How the thing is built |
| [4. Phases](#4-delivery-phases-tests--your-manual-checklists) | Build order, tests, and your manual checklist per phase |
| [5. UI/UX](#5-uiux-design) | What it looks like and why |
| [6. Guardian](#6-guardian--continuous-review--self-healing) | Surviving eGP changing its HTML; the secret code |
| [7. Extras](#7-things-you-didnt-ask-for-but-need) | Risk register, legal, data integrity, repo layout |
| [8. Decisions](#8-decision-log) | Locked decisions and open questions |

Terms used throughout:

- **Flow** — one of the five report pages we extract from.
- **Sprint** — one complete execution of a flow with a chosen filter configuration. Produces exactly one `.xlsx`.
- **Combination** — one concrete set of filter values within a sprint (e.g. Ministry=X, Agency=Y, Year=2025).
- **Site Profile** — the versioned JSON file holding every selector, URL and page rule. The single place the site's structure is described.

---

## 1. Scope of work

### 1.1 Goal

A private Chrome extension that turns a slow, manual, click-heavy reporting task on the Bangladesh e-GP portal into a supervised, resumable, one-click data sprint that ends in a clean Excel table.

### 1.2 The five flows

| # | Flow ID | Page | Special behaviour |
|---|---|---|---|
| 1 | `procurement_transaction_report` | Procurement Transaction Report | List page only |
| 2 | `tender_info` | Tender Info | List page only |
| 3 | `app_info` | APP Info | Per-row **detail page in a new tab** → extract → close → return |
| 4 | `contract_info` | Contract Info | Per-row **detail page in a new tab** → extract → close → return |
| 5 | `experience_info` | Experience Info | Per-row **detail page in a new tab** → extract → close → return |

Flows 1–2 share the **List Pattern**. Flows 3–5 share the **List + Detail Pattern**. Two patterns, five configurations — this is why the engine is flow-agnostic and the flows are data, not code.

### 1.3 Core user journey (the contract)

1. User opens Chrome and navigates to eGP. **(user)**
2. User logs in with their own credentials. **(user — the extension never sees, stores or transmits credentials)**
3. User navigates to the target report page. **(user)**
4. User opens the extension side panel and picks the flow. **(user)**
5. Extension reads the page's filter controls and **mirrors every dropdown into its own UI**, each with an **"All"** checkbox. **(extension)**
6. User selects the values they want; any filter left on "All" will be iterated exhaustively. **(user)**
7. Extension computes the execution plan, shows an estimate, and waits for **Start**. **(user confirms)**
8. Extension applies filters to the real page, walks every combination and every result page, extracts rows, checkpoints continuously, and recovers from throttles/logouts without losing progress. **(extension)**
9. Extension exports **one `.xlsx`, one sheet, one flat database-style table** containing everything from that sprint. **(extension)**
10. User analyses, sorts and filters in Excel. **(user)**

### 1.4 In scope

- Filter mirroring, including **cascading/dependent dropdowns** (Ministry → Agency → PE), where the child option list only exists after the parent is chosen.
- Exhaustive **"All" iteration**, expanded lazily as a tree walk (see §3.5).
- Pagination handling on result lists.
- Detail-page harvesting in a managed background tab for flows 3–5.
- Durable, crash-safe progress; **resume after browser restart**.
- Adaptive pacing and a graded recovery ladder for throttling, logout and server errors.
- Single-sheet flat Excel export with full filter provenance on every row.
- A hidden Developer mode, unlocked by a secret code, offering **both** a drift report and an AI-assisted repair path — developer chooses which.
- Full run logs and an audit trail.

### 1.5 Explicitly out of scope

- Chrome Web Store publication, auto-update infrastructure, or multi-tenant distribution.
- Storing, typing or automating **login credentials**. The user always logs in personally.
- Downloading tender attachments/PDFs (can be a later phase; not v1).
- Any attempt to bypass CAPTCHA, WAF rules, or authentication.
- IP rotation / proxy chaining as a default operating mode (see §7.2).
- Server-side components. Everything runs locally in the user's browser.

### 1.6 Definition of done (v1)

- All five flows complete a full "All"-iterated sprint on live eGP without manual babysitting beyond re-login.
- A killed browser mid-sprint resumes to within one combination of where it stopped, with zero duplicate and zero lost rows.
- Row counts reconcile against the portal's own reported totals for a sampled set of combinations (§7.4).
- Every selector lives in the Site Profile; zero selectors hard-coded in logic files.
- Preflight health check catches an intentionally broken selector before a run starts.
- Secret code unlocks Dev mode; drift report exports and is machine-readable by me.

---

## 2. Discovery plan — how I learn the pages

I cannot design against a site I have not seen. This phase is **you and me at the browser together**, and it is the highest-value part of the project — everything downstream is generated from what we capture here.

### 2.1 The mechanism (agreed: CDP attach)

You launch Chrome with a debugging port open. I attach from this session over the Chrome DevTools Protocol and can read the DOM, the dropdown option lists, and the network traffic of whatever page you are on. **You** do all navigation, login and clicking. **I** observe, ask, and write down what I learn.

Setup (I will script this as `tools/launch-chrome.ps1` in Phase 0):

```
chrome.exe --remote-debugging-port=9222 --user-data-dir="D:\Laragon-root\www\egp_ext\.chrome-profile"
```

Notes on this:
- A **separate profile directory** is used deliberately. Your everyday Chrome profile stays untouched, and your normal browsing is never exposed to this session.
- You log in inside that window. Cookies live in that profile only.
- I read page structure. I do not read, log or store credential fields — the recon scripts explicitly redact `input[type=password]` and any field named like a password/token.
- You can close the window at any moment and the link is severed.

### 2.2 Recon sessions

Seven short sessions. Each ends with a written artifact, so nothing lives only in conversation.

| Session | What we do | Artifact produced |
|---|---|---|
| **R0 — Link-up** | Launch the debug Chrome, I verify attach, we confirm I can read a trivial page | `tools/launch-chrome.ps1`, confirmed CDP link |
| **R1 — Orientation** | You log in; we map the portal shell: nav, session cookie name, logout behaviour, what an expired session looks like, what an error page looks like | `docs/recon/00-portal-shell.md` |
| **R2 — Flow 1** | Procurement Transaction Report, full checklist below | `docs/recon/flow-1.md` + profile fragment |
| **R3 — Flow 2** | Tender Info | `docs/recon/flow-2.md` + fragment |
| **R4 — Flow 3** | APP Info, incl. the detail-tab behaviour | `docs/recon/flow-3.md` + fragment |
| **R5 — Flow 4** | Contract Info | `docs/recon/flow-4.md` + fragment |
| **R6 — Flow 5** | Experience Info | `docs/recon/flow-5.md` + fragment |

### 2.3 The per-flow recon checklist

For each flow I will walk you through exactly these questions, in this order, and ask you to perform specific clicks. This is the script I will follow — you will always know what I need and why.

**A. Identity**
1. Exact URL of the page. Is it reachable directly, or only via navigation?
2. Does a hard refresh keep you on the page, or bounce you to a menu/login?

**B. Filters**
3. Enumerate every filter control: label, HTML type (select / multiselect / date / text / radio), and its `name`/`id`.
4. Which filters are **dependent**? I will ask you to change a parent dropdown while I watch what fires — an XHR? a full postback? — and how long the child takes to populate.
5. Are there filters that are **mandatory** before Search will run?
6. Is there a date range, and what is its format and any maximum span the server enforces?
7. What does the option list look like — are there `--Select--` / `All` placeholder options we must skip or can exploit?

**C. Search & results**
8. What does clicking Search actually do — XHR into a container, or full page reload? *(This is the single biggest determinant of speed and block-risk.)*
9. The result table: exact column headers, and for each, what the value means and its type.
10. Does the page report a total ("Showing 1–20 of 437")? **Critical** — this is our correctness oracle.
11. Pagination model: numbered pages / next button / infinite scroll / page-size selector. Can page size be raised (20 → 100)? Raising it is the cheapest possible throttle mitigation.
12. What is shown for **zero results**? We must distinguish "legitimately empty" from "failed".

**D. Detail pages (flows 3–5 only)**
13. How is the detail opened — `target="_blank"`, `window.open`, JS handler, or a plain link we could navigate directly?
14. Is the detail URL **deterministic** (contains an id we can construct)? If yes, we can skip clicking entirely and navigate straight to it — a large win.
15. What fields does the detail page carry, and which are one-to-many (tables inside the detail)?
16. Does closing the tab disturb the parent page's state (lost pagination, reset filters)?

**E. Failure surfaces**
17. I will ask you to deliberately let the session idle/expire so I can capture the logged-out page signature.
18. We record any error/maintenance page HTML we encounter.
19. We note response timings under normal load, to calibrate the "site is slowing down" detector.

**F. Network**
20. I capture the request/response shape of the search call. If it returns JSON or a clean HTML fragment, we register it as a fast path.

### 2.4 What I hand back after each session

- A human-readable recon note (`docs/recon/flow-N.md`) — findings, screenshots, decisions.
- A **Site Profile fragment** — machine-readable selectors with fallbacks.
- **HTML fixtures** — saved snapshots of the page in each meaningful state (loaded, results, empty, error, detail). These become our offline test suite and our drift baseline. This is why we can test later without hammering the live portal.

> **You do not need to prepare anything.** I will give you one instruction at a time — "click X", "now change the Ministry dropdown", "let this sit for 20 minutes" — and I will explain what I am looking for each time.

---

## 3. System architecture

### 3.1 Shape

```
┌─────────────────────────────────────────────────────────┐
│  SIDE PANEL (UI) — vanilla JS + Web Components           │
│  state is projected from the service worker, never owned │
└───────────────▲─────────────────────────────────────────┘
                │  typed message bus (request/response + events)
┌───────────────▼─────────────────────────────────────────┐
│  SERVICE WORKER — the brain. Owns all state.             │
│   • Job Engine      (plan → queue → execute → checkpoint)│
│   • Rate Governor   (adaptive pacing)                    │
│   • Sentinel        (classifies every page outcome)      │
│   • Recovery Ladder (retry → reset → cooldown → pause)   │
│   • Store           (IndexedDB: rows, checkpoints, logs) │
│   • Exporter        (SheetJS → single-sheet .xlsx)       │
│   • Guardian        (preflight, drift, dev mode)         │
└───────────────▲─────────────────────────────────────────┘
                │  scripting.executeScript / tab messaging
┌───────────────▼─────────────────────────────────────────┐
│  CONTENT SCRIPTS — dumb hands, no state                  │
│   • Filter Reader   • Filter Applier   • Table Parser    │
│   • Detail Parser   • Page Classifier                    │
│  All driven by the SITE PROFILE. Zero hard-coded rules.  │
└─────────────────────────────────────────────────────────┘
```

**Why the service worker owns all state:** MV3 service workers get killed. Content scripts die on navigation. A popup dies when it closes. Only a design where *every* mutation is written to IndexedDB before it is acknowledged survives that. The UI is a pure view. This is what makes "resume after crash" real instead of aspirational.

**Why the Side Panel, not a popup:** a popup closes the instant you click the page — which is constantly, during a run. The side panel stays open beside the page, which is exactly the supervised-run experience you asked for.

### 3.2 The Site Profile — the keystone

Every URL, selector, column mapping and page rule lives in one versioned JSON document. No selector appears anywhere else in the codebase. This one decision is what makes §6 (self-healing) possible at all.

```jsonc
{
  "site": "eprocure.gov.bd",
  "profileVersion": "1.0.0",
  "capturedAt": "2026-09-XX",
  "flows": {
    "procurement_transaction_report": {
      "url": "...",
      "pattern": "list",
      "pageAssert": { "must": ["#reportContainer"], "mustNot": ["#loginForm"] },
      "filters": [
        {
          "id": "ministry",
          "label": "Ministry",
          "selector": "#ddlMinistry",
          "fallbacks": ["select[name*='Ministry']", "label:has-text('Ministry') + select"],
          "type": "select",
          "dependsOn": null,
          "children": ["agency"],
          "skipOptionPatterns": ["^--", "^Select", "^All$"]
        }
      ],
      "search": { "selector": "#btnSearch", "mode": "xhr|postback", "settle": {} },
      "results": {
        "table": "#gvReport",
        "row": "tbody tr",
        "totalText": ".pager-info",
        "columns": [ { "key": "tender_id", "header": "Tender ID", "cell": "td:nth-child(2)", "type": "string" } ]
      },
      "pagination": { "mode": "numbered", "next": "...", "pageSizeControl": "..." }
    }
  }
}
```

Three layers are merged at load time, highest priority last:

1. **Shipped profile** — what we captured and committed.
2. **Override layer** — patches written by Dev mode repairs. Never touches the shipped file, so rollback is one click.
3. **Session layer** — ephemeral, for a single run.

### 3.3 Job model & durability

```
Run ─┬─ Sprint (one flow, one filter config, one .xlsx)
     └─ Combination[] ─┬─ Page[] ─┬─ Row[]
                       └─ Detail[] (flows 3-5)
```

- Every unit has a stable, deterministic ID derived from its filter values — so a resume recomputes identical IDs and knows exactly what is already done.
- Rows are written to IndexedDB **as they are parsed**, not at the end.
- A checkpoint is committed after every completed page and every completed combination.
- Every row carries a `row_hash` (stable hash of its natural key) so overlapping combinations dedupe automatically.

### 3.4 Extraction strategy (hybrid, decided after recon)

Per your answer, we decide this from evidence in §2.3-C8/F20:

- **If** the search is an XHR returning structured data → register it as a **fast path**: the engine replays that call directly. Fewer page loads, far lower throttle risk, much faster.
- **Otherwise** → **UI path**: real clicks on real controls, parse the rendered DOM.
- The engine supports both behind one interface; the profile declares which each flow uses. If a fast path breaks, it falls back to the UI path automatically and logs the downgrade.

### 3.5 Cascading "All" — a tree walk, not a product

This is the subtle part and it will bite anyone who assumes a simple cartesian product.

If Ministry = **All** and Agency = **All**, Agency's option list *does not exist* until a Ministry is chosen. So the plan cannot be fully enumerated up front. Instead:

```
for each Ministry option M:
    select M  →  wait for Agency to repopulate
    for each Agency option A under M:
        select A  →  ... recurse to next dependent level ...
            execute combination, paginate, extract
            CHECKPOINT
```

Consequences designed for:
- The total combination count is an **estimate** until the walk completes. The UI shows `≈` and refines the number live as branches are discovered.
- The checkpoint stores the *path* through the tree (`[M_index, A_index, page]`), so resume re-enters the exact branch.
- A parent with zero children is recorded as a legitimate empty branch, not an error.

### 3.6 Sentinel — classifying what just happened

After every navigation or search, the page is classified into exactly one outcome. Everything downstream keys off this, and it is why the extension can tell "no data" apart from "we got blocked".

| Outcome | Detected by | Action |
|---|---|---|
| `OK` | page assertions pass, results container present | continue |
| `EMPTY` | assertions pass, zero rows, empty-state marker present | record empty, continue |
| `LOGIN_WALL` | login form signature / redirect to login URL | **pause**, notify, wait for user re-login, resume |
| `RATE_LIMITED` | 429/403, throttle text, or latency > adaptive threshold | recovery ladder |
| `SERVER_ERROR` | 5xx, maintenance page signature | recovery ladder |
| `TIMEOUT` | settle condition not met in budget | recovery ladder |
| `SHAPE_CHANGED` | assertions fail but page is clearly not an error | **halt run**, capture drift evidence, alert |

`SHAPE_CHANGED` is deliberately fail-loud. Silently extracting garbage because a column moved is the worst possible outcome for a data project — worse than stopping.

### 3.7 Recovery ladder

Escalates on repeated failure, resets on success:

| Level | Trigger | Response |
|---|---|---|
| 0 | first failure | immediate single retry |
| 1 | 2nd–3rd | exponential backoff with jitter: 5s → 15s → 45s |
| 2 | 4th | **hard reset** — close the working tab, open a fresh one, re-navigate, re-apply filters from checkpoint |
| 3 | 5th | **cool-down** — 5 min pause with visible countdown, then resume at reduced pace |
| 4 | persistent | **pause + desktop notification**; run state preserved indefinitely, resumable days later |

Crucially, **every level resumes from checkpoint**. There is no path in this design where a failure loses collected data — which is the specific failure of your previous tool.

### 3.8 Rate Governor (the alternative to IP rotation)

- Token-bucket pacing with randomised inter-request delay (never a robotic fixed interval).
- Rolling latency measurement: if median response time rises above baseline, the governor **slows down before** the server pushes back.
- Reduce total requests at the source: raise page size where the site allows it, prefer the fast path, reuse one tab rather than opening many.
- Per-run request budget with a visible counter.
- `proxy` permission is **not** requested in the manifest. A documented extension point exists should evidence later prove IP-based blocking — a deliberate, reviewed change, not a default.

### 3.9 Technology choices

| Concern | Choice | Rationale |
|---|---|---|
| Manifest | MV3 | Only option; MV2 is dead |
| UI | Vanilla JS + Web Components + CSS custom properties | No framework, no build step needed to debug, tiny bundle, nothing to go stale |
| Build | esbuild | Sub-second builds; only needed for bundling SheetJS |
| Storage | IndexedDB (via `idb`) | `chrome.storage` is too small and too slow for thousands of rows |
| Excel | SheetJS, **vendored locally** | CSP forbids CDN loading in an extension |
| Tests | Vitest (unit) + Playwright (integration vs local mock) | Test parsers against fixtures, never against live eGP |
| Types | JSDoc + `checkJs` | Type safety without a TS toolchain in the extension |

---

## 4. Delivery phases, tests & your manual checklists

Ten phases. Each has a gate: it is not done until both the automated tests pass **and** you have signed off the manual checklist.

---

### Phase 0 — Foundation
**Goal:** Repo, build, load-and-see-it-work.
**Deliverables:** repo skeleton, `manifest.json`, esbuild config, side panel that opens and says hello, `tools/launch-chrome.ps1`, CDP recon scripts, git initialised with a commit convention.

- *Automated:* build succeeds; manifest validates; lint clean.
- **Your checklist:**
  - [ ] `chrome://extensions` → Developer mode → Load unpacked → loads with **no errors**
  - [ ] Extension icon appears; clicking it opens the side panel
  - [ ] `tools/launch-chrome.ps1` opens a separate debug Chrome and I confirm attach

---

### Phase 1 — Discovery (§2 executed)
**Goal:** Complete, evidence-backed knowledge of all five flows.
**Deliverables:** 6 recon notes, complete Site Profile v1.0.0, HTML fixture library, **local mock eGP server** replaying the fixtures.

- *Automated:* profile validates against its JSON Schema; mock server serves every fixture.
- **Your checklist:**
  - [ ] Sessions R0–R6 completed together
  - [ ] You have read each recon note and confirmed it matches what you know of the portal
  - [ ] Any business rule I got wrong is corrected before we build

---

### Phase 2 — Core engine (flow-agnostic)
**Goal:** The brain, with no site knowledge in it.
**Deliverables:** job engine, state machine, IndexedDB store, checkpoint/resume, message bus, structured logger.

- *Automated:* unit tests on the planner tree walk; **kill-and-resume simulation** proving no lost/duplicate rows; ID determinism tests.
- **Your checklist:**
  - [ ] I demo a fake 3-level run, kill the service worker mid-way, and it resumes exactly
  - [ ] Log output is readable to you, not just to me

---

### Phase 3 — Flow 1 vertical slice
**Goal:** One flow working end-to-end against the **mock**, then live.
**Deliverables:** filter mirroring, cascading "All" expansion, filter application, table parsing, pagination, checkpointing, raw export.

- *Automated:* parser golden-file tests vs fixtures; pagination tests; cascade tests; empty-state test.
- **Your checklist:**
  - [ ] Panel shows the same dropdowns as the real page, with the same options
  - [ ] Selecting values in the panel visibly applies them to the real page
  - [ ] A small run (one ministry, one year) produces rows that **match what you see on screen**, spot-checked row by row
  - [ ] Row count matches the portal's own "of N" total

---

### Phase 4 — UI build-out
**Goal:** §5 realised.
**Deliverables:** full side panel — flow picker, filter card, plan preview, run controls, live progress, log stream, export, empty/error/loading states, light + dark.

- *Automated:* component tests; accessibility pass (keyboard, focus order, contrast ≥ 4.5:1).
- **Your checklist:**
  - [ ] Every state legible at a glance — you can tell what it's doing without asking me
  - [ ] Pause/Resume/Stop behave exactly as labelled
  - [ ] Nothing shifts or flickers during a run
  - [ ] Looks right in both light and dark

---

### Phase 5 — Flow 2
**Goal:** Prove the List Pattern generalises.
**Success criterion:** flow 2 is added by **writing profile JSON only** — zero new engine code. If engine changes are needed, the abstraction was wrong and we fix it here, not later.

- **Your checklist:** [ ] Small live run verified against the page, same as Phase 3.

---

### Phase 6 — Flows 3, 4, 5 (List + Detail)
**Goal:** The detail-tab pattern.
**Deliverables:** managed background tab lifecycle, detail parser, direct-URL fast path where the detail URL is deterministic, merge of list row + detail fields into one flat record, orphan-tab cleanup.

- *Automated:* tab lifecycle tests (incl. "tab crashed mid-extract"); merge tests; leak test — 200 details, zero tabs left open.
- **Your checklist:**
  - [ ] Detail tabs open and close cleanly; nothing piles up
  - [ ] The parent page keeps its place — pagination is not reset
  - [ ] A row's detail fields match the detail page, spot-checked on 5 rows
  - [ ] Interrupting mid-detail and resuming does not duplicate or skip that row

---

### Phase 7 — Resilience
**Goal:** Survive eGP pushing back.
**Deliverables:** Sentinel classifiers built from **real captured signatures**, recovery ladder, rate governor, login-wall pause/resume, desktop notifications.

- *Automated:* fault-injection suite against the mock — 429s, 500s, session drops, hangs, malformed HTML; assert correct classification and correct ladder level every time.
- **Your checklist:**
  - [ ] I force a logout mid-run; extension pauses, tells you to log in, and resumes cleanly after you do
  - [ ] I kill the network mid-run; it backs off and recovers, no data lost
  - [ ] You close the browser mid-run; on reopen it offers to resume and does so correctly

---

### Phase 8 — Export & data quality
**Goal:** The Excel file you actually wanted.
**Deliverables:** single-sheet flat export; provenance columns; type coercion (dates as dates, numbers as numbers); frozen header + autofilter; dedupe by `row_hash`; **reconciliation report** comparing collected vs portal-reported totals.

- *Automated:* export golden tests; type coercion tests; dedupe tests; large-file test.
- **Your checklist:**
  - [ ] File opens in Excel with no repair prompt
  - [ ] Sorting and filtering work natively; dates sort as dates
  - [ ] Filter context columns let you tell exactly where any row came from
  - [ ] Reconciliation report shows zero unexplained gaps

---

### Phase 9 — Guardian & Dev mode
**Goal:** §6 realised.
**Deliverables:** preflight health check, drift detection, secret-code gate, Developer panel offering **both** repair modes with you choosing, drift report export, override layer with rollback.

- *Automated:* deliberately break a selector in a fixture → preflight must catch it before the run starts; drift report schema validation; override apply/rollback tests.
- **Your checklist:**
  - [ ] Secret code opens Dev panel; wrong code does nothing and is not guessable from the UI
  - [ ] With a selector broken, preflight blocks the run and explains which one
  - [ ] Dev panel offers both paths and you can choose
  - [ ] Drift report exports and I can act on it
  - [ ] A bad override can be rolled back in one click

---

### Phase 10 — Hardening & handover
**Deliverables:** full-scale live runs of all five flows; performance profiling; `README`, `OPERATIONS.md` (day-to-day), `MAINTENANCE.md` (what to do when the site changes), `SITE-PROFILE.md`; final code review; v1.0.0 tag.

- **Your checklist:**
  - [ ] You ran a full sprint on every flow yourself, unaided by me
  - [ ] The docs answered your questions without asking me
  - [ ] You can load the extension on a fresh machine from the repo alone

---

## 5. UI/UX design

### 5.1 Principles

1. **One surface.** The side panel is the whole application. No popup, no options page, no separate windows.
2. **Always answer three questions:** What is it doing? How far along? What do I do next?
3. **Progressive disclosure.** Setup, run, and export are three states of one panel — never all at once.
4. **Quiet by default.** Colour is reserved for status. Grey is the resting state; colour means something.
5. **No dead ends.** Every error names the problem and offers the next action.
6. **Honest progress.** `≈` when the total is an estimate. Never a fake percentage.

### 5.2 Visual language

- **Type:** `Inter`, system fallback. 13px base (side panels are narrow), 11px meta, 15px headings. Tabular numerals for all counters so digits don't jitter.
- **Density:** 8px spacing grid. Comfortable, not cramped — a 400px panel with air beats a dense one.
- **Radius:** 8px cards, 6px controls.
- **Colour:** near-neutral base; a single indigo accent; semantic colours only for state.
  - `--ok #16a34a` · `--warn #d97706` · `--error #dc2626` · `--accent #4f46e5` · `--muted` greys
- **Dark mode:** full parity via CSS custom properties and `prefers-color-scheme`. Not an afterthought.
- **Motion:** 150ms ease-out on state change only. No spinners that spin forever — indeterminate work shows a live activity line instead.

### 5.3 Layout

```
┌────────────────────────────────────────┐
│  eGP Extractor            ● Ready      │  ← header: status pill, always visible
├────────────────────────────────────────┤
│  Flow                                  │
│  ┌──────────────────────────────────┐  │
│  │ Procurement Transaction Report ▾ │  │
│  └──────────────────────────────────┘  │
│  ✓ Page matches this flow              │  ← live page-match check
├────────────────────────────────────────┤
│  FILTERS                    ⟳ Reload   │
│                                        │
│  Ministry                    [✓] All   │  ← "All" checkbox disables the select
│  ┌──────────────────────────────────┐  │
│  │ (all 42 items)                ▾  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Agency                      [ ] All   │
│  ┌──────────────────────────────────┐  │
│  │ Roads & Highways Department   ▾  │  │
│  └──────────────────────────────────┘  │
│    ↳ depends on Ministry               │  ← dependency made visible
│                                        │
│  Fiscal Year                 [ ] All   │
│  ┌──────────────────────────────────┐  │
│  │ 2024-2025                     ▾  │  │
│  └──────────────────────────────────┘  │
├────────────────────────────────────────┤
│  PLAN                                  │
│  ≈ 42 combinations · ≈ 18 min          │  ← estimate, honestly marked
│  Est. 1,200–3,000 rows                 │
│                                        │
│         ┌──────────────────────┐       │
│         │    ▶  Start sprint   │       │  ← single primary action
│         └──────────────────────┘       │
└────────────────────────────────────────┘
```

**Running state** replaces PLAN and collapses FILTERS:

```
├────────────────────────────────────────┤
│  ● Running          ⏸ Pause   ⏹ Stop   │
│                                        │
│  ████████████░░░░░░░░░░░░  17/≈42      │
│                                        │
│  Ministry: Ministry of Communication   │  ← current branch, in plain words
│  Agency:   Roads & Highways Dept       │
│  Page 3 of 8                           │
│                                        │
│  1,847 rows   ·   6.2 rows/s   ·  4:12 │
│                                        │
│  ▸ Activity log                        │  ← collapsed by default
└────────────────────────────────────────┘
```

**Recovering state** — the moment that matters most, and where most tools go silent:

```
│  ⚠ Site not responding                 │
│  Backing off · retry in 0:38           │
│  Attempt 2 of 5 · progress is saved    │  ← the reassurance is the feature
│                     [ Retry now ]      │
```

**Login-wall state:**

```
│  ⚠ Your eGP session expired            │
│  Log in again in the eGP tab.          │
│  The sprint will resume automatically. │
│  1,847 rows collected so far — safe.   │
│                     [ Open eGP tab ]   │
```

**Done state:**

```
│  ✓ Sprint complete                     │
│  3,241 rows · 42 combinations · 21:04  │
│  ✓ Totals reconciled with portal       │
│                                        │
│    ┌────────────────────────────┐      │
│    │  ⬇ Download Excel          │      │
│    └────────────────────────────┘      │
│    View report · Start another         │
```

### 5.4 Interaction rules

- **"All" checkbox** disables its select and shows the option count (`all 42 items`) — you always know the size of what you asked for.
- Checking "All" on a **parent** automatically implies iteration of its children; the UI says so explicitly rather than leaving you to infer it.
- **Start is disabled** until the page matches the flow and the plan is computable, with the reason shown inline.
- **Pause** is instant and safe. **Stop** asks once, then exports whatever was collected — never discards it.
- Every error toast carries an action, never just an apology.
- Full keyboard operation; visible focus rings; ARIA live region announcing state changes.

### 5.5 Dev mode entry

Nothing in the UI hints it exists. Clicking the version number in the footer **7 times** reveals a single unlabelled input. The correct code opens the Developer panel. A wrong code does nothing at all — no error, no shake, no feedback that a code even exists.

---

## 6. Guardian — continuous review & self-healing

eGP will change its HTML. This section is how the project survives that, and it is the reason §3.2 exists.

### 6.1 Defence in depth

**Layer 1 — Resilient selectors.** Every selector ships with ordered fallbacks and a semantic strategy (find by *label text*, not by `#ctl00_ContentPlaceHolder1_ddl3`). ASP.NET-generated IDs are the most fragile thing on a page; we never depend on one alone.

**Layer 2 — Preflight health check.** Before every run, the extension silently asserts every selector the flow needs against the live page. Any failure blocks the run with a precise message: *"Filter 'Agency' not found — site may have changed. Run Dev → Drift Report."* **You never get corrupt data from a changed page; you get a stop.**

**Layer 3 — Runtime assertions.** Column count, header text and value types are checked per page. A silently shifted column is caught, not exported.

**Layer 4 — Structural fingerprint.** Each captured page has a stored fingerprint (normalised DOM skeleton hash + key landmarks). Drift is measured against it, so we can tell "cosmetic change" from "structural change".

### 6.2 The secret code

- The code is **never stored in plaintext**. The source contains only `SHA-256(code + salt)`.
- **Honest note:** an unpacked extension's source is readable by anyone with the folder. The code is a **safety interlock against accidental activation**, not a security boundary against an attacker who already has your disk. It is exactly as strong as it needs to be for its actual job.
- Rate-limited: 5 wrong attempts → 15-minute lockout, to stop idle guessing.
- Unlocks for the session only; re-locks on browser restart.
- Changeable from within Dev mode.

### 6.3 Dev panel — both paths, you choose

Per your instruction, the panel presents **both** options and the developer picks:

```
┌────────────────────────────────────────┐
│  DEVELOPER MODE            🔓 unlocked │
├────────────────────────────────────────┤
│  Health                                │
│  Flow 1  ✓ 24/24 selectors OK          │
│  Flow 2  ✓ 19/19                       │
│  Flow 3  ⚠ 2 fallbacks used            │  ← degraded, not broken: early warning
│  Flow 4  ✗ 3 selectors missing         │
│  Flow 5  ✓ 22/22                       │
│                                        │
│         [ Run full health scan ]       │
├────────────────────────────────────────┤
│  Site change detected in Flow 4.       │
│  How do you want to repair it?         │
│                                        │
│  ○ A · Export drift report             │
│      Capture evidence for the          │
│      developer to patch. Offline,      │
│      no API key, reviewed by a human.  │
│                                        │
│  ○ B · AI-assisted repair              │
│      Propose new selectors here and    │
│      now. Needs your API key, entered  │
│      at use time. Every change is      │
│      shown as a diff and requires      │
│      your approval before it saves.    │
│                                        │
│              [ Continue ]              │
├────────────────────────────────────────┤
│  Overrides: 2 active  [View] [Rollback]│
└────────────────────────────────────────┘
```

**Path A — Drift report.** Produces `drift-report-<flow>-<date>.zip`:
- failing selectors, with what was expected and what was found
- sanitised DOM snippets around each failure (credentials/tokens stripped)
- current vs baseline structural fingerprint, with a diff
- candidate replacement selectors, ranked, generated locally by heuristic
- screenshots of the affected regions
- environment: profile version, extension version, Chrome version, timestamp

That file is directly consumable by me. Hand it over and I patch the profile — **and if needed I re-drive the controlled Chrome exactly as in §2 to re-inspect from scratch and diff the site against the code.**

**Path B — AI-assisted repair.**
- API key is entered at the moment of use, held in memory, **never persisted, never bundled**.
- Only the sanitised DOM fragment is sent — never full pages, never session data.
- The proposal is shown as a **before/after diff with a live test result** ("proposed selector matches 1 element, extracts: 'Roads & Highways Department'").
- Nothing is written without your explicit approval.
- Approved changes land in the **override layer** with a full audit entry; one-click rollback.
- Overrides are marked provisional until they are folded into the shipped profile by a reviewed commit.

### 6.4 Versioning & audit

- Site Profile is semver'd: **patch** = selector fix, **minor** = new field/filter, **major** = restructure.
- `CHANGELOG-PROFILE.md` records every change, its cause, and the drift report that motivated it.
- Extracted data carries `profileVersion` — so you can always tell which extraction rules produced any given file.
- Every extraction run stores a manifest: profile version, extension version, timestamp, filter config, counts, warnings.

### 6.5 Standing maintenance rhythm

- **Every run:** preflight (automatic, invisible unless it fails).
- **Monthly:** you open Dev → Run full health scan. Two minutes. Catches drift before it interrupts real work.
- **On any anomaly** (odd counts, missing columns, unexplained stops): export drift report, send to me.
- **After each repair:** fixtures refreshed, golden tests updated, fingerprint baseline re-based.

---

## 7. Things you didn't ask for, but need

### 7.1 Legal & ethical posture

- Data is accessed **through your own authenticated account**, with the access rights you already hold. The extension automates your own clicks; it does not obtain anything you could not obtain manually.
- No authentication bypass, no CAPTCHA solving, no WAF evasion. If the portal genuinely blocks us, we slow down — we do not fight it.
- Public procurement data is published for transparency; this tooling serves that purpose.
- Politeness is designed in, not bolted on: the rate governor exists so this never becomes a load problem for a public service.
- **Recommended:** check the portal's terms of use for automation clauses. If any doubt exists, that is a conversation with BPPA, not a technical workaround.

### 7.2 On IP rotation (raised, and my recommendation)

Recorded for the decision log:

1. Throttling on an authenticated portal is almost certainly **per account**, not per IP. Rotating IPs would not lift a per-account limit.
2. A mid-session IP change is the classic **session-hijack signature**. The likely result is forced logout — more interruptions, not fewer.
3. It exposes **your real eGP identity** to a deliberate-circumvention finding. The technical risk is small; the account risk is not.
4. Your reported symptom — *"stops and does not start over"* — is a **resume** defect. Checkpointing (§3.3) plus the recovery ladder (§3.7) addresses it directly. Under ~5,000 rows, a well-paced run most likely never trips a limit at all.

**Recommendation:** ship without proxying. Instrument thoroughly. If Phase 7 produces hard evidence of IP-scoped blocking, we reopen this with data. The architecture leaves a clean extension point; the manifest deliberately does not request the permission.

### 7.3 Security & privacy

- Zero credential handling — ever.
- Minimum permissions: `sidePanel`, `storage`, `scripting`, `tabs`, `downloads`, `notifications`, and host permission scoped to `*://*.eprocure.gov.bd/*` only.
- No analytics, no telemetry, no outbound network calls — except Path B, only when you personally trigger it with your own key.
- All extracted data stays on your machine.
- Drift reports are sanitised before they leave the machine.
- Vendored dependencies pinned and hash-checked; no runtime CDN.

### 7.4 Data integrity (the part that decides whether this is trustworthy)

- **Reconciliation:** compare rows collected against the portal's own reported total per combination. Any mismatch is surfaced in the report, not hidden.
- **Dedupe** on a stable `row_hash` — necessary because tree-walked combinations can overlap.
- **Provenance:** every row carries `run_id`, `combination_id`, the filter values used, `source_url` and `extracted_at`. Any row can be traced back to the exact page it came from.
- **Type discipline:** dates parsed to real dates, currency to numbers, IDs kept as text (leading zeros survive).
- **Nothing invented:** a missing value is empty, never zero, never `"N/A"`.

### 7.5 Repo layout

```
egp_ext/
├─ PROJECT_PLAN.md          ← this document
├─ README.md
├─ manifest.json
├─ src/
│  ├─ background/           service worker: engine, sentinel, governor, store, exporter, guardian
│  ├─ content/              filter reader/applier, table & detail parsers, page classifier
│  ├─ panel/                side panel UI + components
│  └─ shared/               profile loader, schemas, message bus, types, utils
├─ profiles/
│  ├─ eprocure.gov.bd.json  shipped Site Profile
│  └─ schema.json
├─ vendor/                  SheetJS, idb (pinned)
├─ tests/
│  ├─ unit/  fixtures/  golden/  e2e/
│  └─ mock-server/          local replay of captured eGP pages
├─ tools/                   launch-chrome.ps1, recon scripts, profile validator
└─ docs/
   ├─ recon/                flow-1..5 + portal shell
   ├─ OPERATIONS.md  MAINTENANCE.md  SITE-PROFILE.md
   └─ CHANGELOG-PROFILE.md
```

### 7.6 Risk register

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | eGP changes HTML | High | Site Profile + fallbacks + preflight + Guardian (§6) |
| R2 | Blocking under load | High | Rate governor, recovery ladder, fast path, larger page size |
| R3 | Cascading dropdowns deeper/odder than expected | Medium | Recursive tree walk is depth-agnostic by design |
| R4 | MV3 service worker killed mid-run | Medium | Every mutation persisted before ack; resume proven in Phase 2 |
| R5 | Detail tabs leak / crash browser | Medium | Managed lifecycle, hard cap on concurrent tabs, leak test |
| R6 | Silent data corruption after a site change | **Critical** | Fail-loud `SHAPE_CHANGED`, runtime assertions, reconciliation |
| R7 | Combination count explodes | Medium | Live estimate before start, hard budget, pause/resume any time |
| R8 | Portal introduces CAPTCHA | High | Detect, pause, hand to user. No bypass. Escalate to policy question |
| R9 | Session expiry mid-long-run | Medium | Login-wall detection, pause, prompt, auto-resume |
| R10 | Excel row limit (1,048,576) | Low | Chunked export with row-count guard |

### 7.7 Working agreement

- I will always tell you **exactly** which page to open and which control to click during recon, and why.
- No phase is "done" until you tick its manual checklist.
- Anything I assume gets written into §8 as an assumption, not buried in code.
- Every live-site test uses the smallest filter selection that proves the point. We do not hammer eGP to test our own code — that is what the mock server is for.

---

## 8. Decision log

### Locked

| # | Decision | Rationale |
|---|---|---|
| D1 | Target = Bangladesh eGP, `eprocure.gov.bd` | Confirmed |
| D2 | Recon via CDP attach to a dedicated debug Chrome profile | Confirmed; keeps your normal profile untouched |
| D3 | Dev mode offers **both** drift report and AI-assisted repair; developer chooses | Confirmed |
| D4 | Export = one `.xlsx` per sprint, one sheet, one flat DB-style table | Confirmed |
| D5 | Scale target ≈ under 5,000 rows/sprint (architecture tolerates 10×) | Confirmed |
| D6 | Attended runs that survive hiccups without losing progress | Confirmed |
| D7 | Extraction = hybrid; fast path where recon finds one, UI path otherwise | Confirmed — resolved by evidence in Phase 1 |
| D8 | No IP rotation in v1; documented extension point only | Recommended (§7.2), pending your final call |
| D9 | MV3 + Side Panel + vanilla JS + IndexedDB + SheetJS | Architect's call (§3.9) |
| D10 | All site knowledge externalised to a versioned Site Profile | Architect's call — prerequisite for §6 |
| D11 | Flows 2–5 run **logged out** (public Advanced Search, all departments); Flow 1 runs logged in (PWD-scoped report) | Owner, 2026-11-04 (recon R2). See docs/recon/flow-1.md |
| D12 | Flow 2: a filter on "All" is left blank and the result pages are swept once; filter values are not looped. Flow 1 still loops offices | Owner, 2026-11-05 (recon R3). See docs/recon/flow-2.md |
| D13 | Flow 2: Start requires a Department and a Publishing date window of at most **5 years**; each date box carries a "current date" checkbox, ticked by default, so an unset end of the window means today; Tender ID or Reference No. searches are exempt | Owner, 2026-11-05 (span raised from 3 to 5 years). See docs/recon/flow-2.md |
| D14 | Flow 2: one row per tender, because multi-lot tenders do not exist yet; more than one lot is flagged, never dropped | Owner, 2026-11-05. See docs/recon/flow-2.md |
| D15 | Flow 3: all 11 filters in the panel; **Department and Financial Year both mandatory** before a run starts; the notice/detail field palette starts empty | Owner, 2026-11-05 (recon R4). See docs/recon/flow-3.md |
| D16 | Flow 3: one row per package; e-GP has no multi-lot packages, so lot fields are plain columns. More than one lot is flagged, never dropped | Owner, 2026-11-05. Extends D14. See docs/recon/flow-3.md |
| D17 | Flow 3: the panel fetches the Procuring Entity list per department; the **detail** field of that name is a person's name and stays out of the palette unless the owner asks for it | Owner, 2026-11-05. See docs/recon/flow-3.md |
| D18 | **Proposed, awaiting the owner's answer.** Filters are live: on load the panel scans every filter and its items from the page; each change is applied to the real page, then all filters are rescanned. No option lists are stored anywhere. A thin Site Profile entry still names each filter (label, type, rule) for what a scan cannot see: tree popups, operator filters, mandatory rules, hidden filters, and the check that a filter has vanished | Owner's idea, 2026-11-05, with Claude's thin-profile addition. Changes M3 |

### Open — to resolve during Phase 1

| # | Question | Resolved by |
|---|---|---|
| Q1 | Does the search use XHR or full postback per flow? | R2–R6 |
| Q2 | Are detail URLs deterministic (skip the click entirely)? | R4–R6 |
| Q3 | Can page size be raised beyond the default? | R2–R6 |
| Q4 | Real throttle signature | R1 + Phase 7 instrumentation |
| Q5 | Exact cascade depth per flow | R2–R6 |
| Q6 | Which columns form each flow's natural key (for dedupe) | R2–R6 + your domain input |
| Q7 | Secret code value | You choose privately; only its hash enters the repo |

### Assumptions until contradicted

- A1 — You have a valid eGP account with access to all five reports.
- A2 — The portal is reachable and stable enough for recon sessions.
- A3 — Reports are HTML pages, not a JS SPA. *(If any flow is an SPA, its recon takes longer; the architecture still holds.)*
- A4 — One user, one machine. No multi-user deployment.
- A5 — English UI. If Bangla labels appear, label-based selectors must be locale-aware — noted for Phase 1.

---

## 9. Immediate next steps

1. **You:** read this document, correct anything I have wrong about the portal or your intent.
2. **You:** answer Q7 (pick a secret code — tell me only when you want the hash generated) and confirm D8.
3. **Me:** Phase 0 — repo skeleton, manifest, hello-world side panel, `launch-chrome.ps1`, CDP recon harness.
4. **Together:** session R0 — launch debug Chrome, confirm the link.
5. **Together:** sessions R1–R6 — the discovery work. This is where the project is really won.
