# Self-run flow test log

**Asked by the owner, 2026-11-06.** A record of every flow test Claude runs alone, so that the same test can be repeated logged in and compared with logged out, to design the system. Add a row for every run, including failed ones.

Raw results stay in the git-ignored `recon/raw/study/<state>/`, on the PC that ran them. **Only this log and the summaries travel between PCs.** So a comparison must run on a PC holding both sets, or the earlier run must be repeated there.

## How to repeat this test

**Logged out** (no login needed):
```
node tools/recon/study.js --state logged-out --limit 900
```

**Logged in** (the owner logs in first, in the debug Chrome; Claude never logs in):
```
npm run recon -- stop
```
Then, once the owner has logged in:
```
node tools/recon/study.js --state logged-in --department 21 --limit 900
```
**The owner logs in, not Claude (2026-11-06).** The owner offered their credentials, with full permission; Claude declined, because a password read here would end up in session records. The tool re-checks the session every 30 requests, and on a lost session it stops and resumes after the owner logs in again.

`--department` must be the account's **own** department. On Flow 2, a login locks the Department, and the tool won't send anything else (see "Not to be tested" in `r7-logged-in-audit.md`). The tool checks the page's login state first and refuses to run if it doesn't match `--state`.

**Compare:**
```
node tools/recon/study-compare.js
```
For each flow and filter value, it shows the pages logged out and logged in, and which field labels occur only on one side. Then record the result below.

**Expect one difference by design:** a logged-out run covers all departments, and a logged-in one may be limited to the account's department on some flows. The compare tool flags those filter values, so they aren't mistaken for login effects. Use `--department 21` on the logged-out run as well for a strict like-for-like count; add `--label pwd` to keep its results apart.

## Run log

| # | Date, time (Bangladesh) | PC | State | Scope | Requests | Result | Notes |
|---|---|---|---|---|---|---|---|
| 1 | 2026-11-06 12:13 | home | logged out | Flow 2, test | 8 | Tool worked | Size limit reached as intended |
| 2 | 2026-11-06 12:14–12:20 | home | logged out | Flows 2–5 | 74 | **Stopped early, tool fault** | Link went quiet; the tool exited with code 0. Fixed: a time limit on each call, reconnects, and a stated stop reason |
| 3 | 2026-11-06 12:26–13:13 | home | logged out | Flows 2–5, resumed | 665 | **Stopped by its safety rule; tool fault on two flows** | Flows 2 and 4 complete. A Flow 5 search took 54 s, over the 20 s limit, and it stopped as designed. **Flows 3 and 5 opened 0 detail pages:** their links use single quotes, which the tool didn't accept. Their page counts stand; their samples are redone in run 4 |
| 4 | 2026-11-06 13:30–13:51 | home | logged out | Flows 3 and 5 only | 282 | **FINISHED**, no link problems | Waited 15 min first, for the portal's sake. 2 rows per list. Flow 5 single-factor samples used Tender Type eTenders, since All is the slow query |

| 5 | 2026-11-06 14:07 | home | logged in | Flows 2–5 | 0 | **Refused by the login check; tool fault** | The tool opened the search page directly in a new tab. That tab went to SessionTimedOut.jsp, and the session ended: **probably caused by that direct open**, not proven. Fixed: a logged-in run uses the owner's own tab, reached by the normal route |
| 6 | 2026-11-06 14:16 | home | logged in | Flows 2–5 | 0 | Refused: owner's tab wasn't on the search page | Worked as designed |
| 7 | 2026-11-06 14:19–15:10 | home | logged in | Flows 2, 3, 4 and part of 5 | about 800 | **Stopped: network lost in a power cut** | 3 failed requests in a row. Data intact. Session survived |
| 8 | 2026-11-06 15:21–15:23 | home | logged in | Flow 5 | about 30 | **Stopped: network lost in a power cut** | Same |
| 9 | 2026-11-06 15:31–15:36 | home | logged in | Flow 5 | 84 | **FINISHED**, no link problems | All 169 filter values complete. Compared in `r8-format-study.md` |
| 10 | 2026-11-06 15:51–17:12 | home | logged out, PWD only | Flows 2–5 | 793 | **FINISHED**, no link problems | Owner's request. Claude pressed Logout first. 5 s pace. Results in `recon/raw/study/logged-out-pwd/`. Compare: `study-compare.js logged-out-pwd logged-in`. Written up in `r8-format-study.md` |

| 11 | 2026-11-07 | home | logged out | Flow 2, 4 public notices | 5 | **Done** | Owner asked for evidence on the Query table. One notice read twice (first read returned nothing to the script). 5 s apart on the last three. No block |
| 12 | 2026-11-07 | home | logged out | Public saved pages for the test bed, one per layout | 27 | **FINISHED** three times, no block | `tools/recon/capture-fixtures.js`. Claude opened and closed the debug Chrome. About 5 s pace. Raw pages in `recon/raw/fixtures/`. Repeat: `npm run chrome`, then `node tools/recon/capture-fixtures.js`; it skips what's saved |
| 13 | 2026-11-10 night | home | logged in (owner) | Flow 1, read-only probes by direct request: 5 offices' project lists, report with and without a project, project with another office, office 0 and blank | 14 | **FINISHED** | Found: report Total cells arrive blank (the tool read every live report as empty); a project shows only under its own office; office 0 with a project gives the project's figures, identical to its own office's. D68 |
| 14 | 2026-11-10 night | home | logged in (owner) | Flow 1, the owner's 8 combinations through the panel (v0.8.0): offices 1552, 1231; projects 10083, 2975; years 2023-2024, 2024-2025 or all 17 | about 160 reports, tool's pace | **FINISHED, all 8 ran** | 1.1 and 1.5 stopped after 4 reports by design (3,808 and 448); 1.2: 34, 6 with figures; 1.3: 34, 22; 1.4: 68, 2; 1.6: 4, 1; 1.7: 4, 4; 1.8: 8, 1. File read back: About + 3 budget sheets, zero rows left out. Repeat: `node tools/recon/live-flow1.js`, logged in |
| 15 | 2026-11-11 night | home | logged out | Flows 4 and 5 through the panel (v0.9.0): PWD, office 1552; sign date / contract start 01/07/2023–30/06/2024; every detail field group | 168 list and detail pages, tool's pace | **FINISHED** | Flow 4: 166 rows, the page showed 17 pages at size 10; 166 distinct Tender IDs; 166 detail pages read; no empty column; verdict Complete; 10 min. Flow 5: 1 row, as the page showed; detail read; Complete. A first window (Jul–Dec 2025) gave 0 rows, and the page itself said No record found. Also found: Chrome ran a cached old background after a restart, showing the new version number; the D71 warning caught it. Repeat: `node tools/recon/live-flows45.js` |
| 16 | 2026-11-11 | home | logged in (owner) | Flow 2 through the panel (v0.9.0), on the owner's own eTenders tab: own department (locked), office 1552, published 01/09/2026–10/11/2026, every detail field group | 128, tool's pace | **FINISHED** | 126 rows = plan; 126 distinct Tender IDs; 126 detail pages read, 0 refused; methods LTM 116, RFQU 10 (both hidden when logged out); file says Logged in; Complete; 8 min. **Session held:** the portal answered logged in before and after. No logged-out warning, as designed. Repeat: `node tools/recon/live-flow2-in.js` |
| 17 | 2026-11-11 evening | home | logged out | **Long run.** Flow 4 through the panel (v0.9.0): PWD, all offices, sign dates 01/09/2025–31/10/2025, every detail field group | 1,204 counted by the tool (12 list pages and 1,191 detail pages make 1,203), tool's pace | **FINISHED** | 1,191 rows = plan; 1,191 distinct contracts; 1,191 detail pages read, 0 failed, 0 refused; **0 retries, no interruption, no slow response, no block**; verdict Complete; **72 min, 3.6 s per request.** The script tried smaller windows first (294 and 551 rows) and ran the first over 600. The panel estimated 1.5 to 2 hours: too high, because each detail page was costed at 0.5 s and measured 0.1–0.25 s (runs 15–17). Corrected to 0.2 s; it now says "About 1 hour to 2 hours". Repeat: `node tools/recon/live-long.js` |
| 18 | 2026-11-12 night | home | logged in (owner) | Flow 4 through the panel (v0.10.0), on the owner's own Contract Information tab opened from the menu: PWD, office 1552, sign date 01/07/2023–30/06/2024, every detail field group. **Same search as run 15 (logged out)** | 168, tool's pace | **FINISHED** | 166 rows = plan = run 15's 166; 166 distinct Tender IDs; 166 detail pages read; 41 columns, none always empty; Complete; 10 min. **Session held:** logged in before and after, by the portal's answer. **Department:** the tree icon is visible and clickable logged in, so the department can be chosen on Flow 4 (D75); the text box is read-only both ways, because the tree fills it. Repeat: `TAB=own ONLY=Flow4 FROM=01/07/2023 TO=30/06/2024 node tools/recon/live-flows45.js` |
| 19 | 2026-11-12 night | home | logged in (owner) | Flow 5 through the panel (v0.11.0), owner's own eExperience tab: PWD, office 1552, contract start 01/07/2020–30/06/2025 | 3, tool's pace | **FINISHED** | 1 row = plan; detail read; 38 columns, none empty; Complete. Office 1552 has 1 experience record in those 5 years (the page's own date boxes read 01/07/2020 and 30/06/2025, so the dates were applied). Logged in before and after |
| 20 | 2026-11-12 night | home | logged in (owner) | Flow 5, all PWD offices, contract start January 2025: **five attempts failed in the test script, before any search was sent** | 0 searches; a session check per attempt | **Script faults, fixed** | (1) a finished run was still on the panel, so the filters never came; (2) the panel had reopened the department tree a failed attempt left open (deliberate: the panel restores what was open), covering the button; (3) Playwright's instant fill added the To date to the old one in 1 of 3 tries, while typing like a person was right 3 of 3. **No PDMS fault found:** New search does stick (both runs on the tab read back as cleared); the panel showed the finished run straight away in 5 of 5 loads. The script now clears a finished run and a restored tree, types dates and reads them back, closes its panel, and saves a screenshot at load and on failure |
| 21 | 2026-11-12 night | home | logged in (owner) | Flow 5, all PWD offices, contract start 01/01/2025–31/01/2025, every detail field | 15, tool's pace | **FINISHED** | 13 rows = plan (the page showed 2 pages at size 10); 13 distinct Record IDs; 13 detail pages read; 38 columns, none empty; Complete; 54 s. Logged in before and after. Repeat: `TAB=own ONLY=Flow5 OFFICE=all FROM=01/01/2025 TO=31/01/2025 MAX=150 node tools/recon/live-flows45.js` |
| 22 | 2026-11-12 night | home | logged in (owner) | Flow 5, all PWD offices, contract start 01/01/2025–31/08/2025, every detail field | 80, tool's pace | **FINISHED** | **72 rows = plan** (the page showed 8 pages at size 10); 72 distinct Record IDs; 72 detail pages read; 38 columns, none empty; Complete; 4 min 21 s. Logged in before and after. PWD gives about 9 experience records a month |

**Deviation from the study plan:** the plan said at most 900 requests in a run. Each run holds to that, but runs 1–4 together came to 1,029, because of the tool fault.

**Total, runs 1–10:** about 2,740 requests.

**Results:** `r8-format-study.md`.
