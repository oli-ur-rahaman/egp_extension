# Build plan

**Written 2026-11-06, after studies R7 and R8. Status: proposed, for the owner's approval.** It replaces the build order of `EXECUTION_PLAN.md` §7 where they differ. Module and task IDs there still apply. The owner has set quality above dates (D34), so stages have **gates, not deadlines**, and the old M1–M5 dates no longer apply.

**Deviations from the Proposal and ToR, for the owner's decision (D28):** the 10-week milestones and their payment dates; the two-sheet workbook (D26, accepted); LTM export (D29, accepted). The owner's demo moves to the end of stage B3.

## What the studies changed

| Finding | What it does to the build |
|---|---|
| Detail data is the main purpose; one page holds all its fields | Detail collection is core. Clusters, not field ticks |
| A page's format varies by Nature, notice kind, Method, date and status | One field reads several labels; a missing label is empty; an unknown label is reported, never fatal |
| **"Fail loud" must not fire on a known layout** | Shape checks test the page's identity and required landmarks, not a fixed field list |
| A full sweep loses rows on tied timestamps | Count check always; recovery in B5 |
| Size 100 works on all four servlets | Default list size 100 |
| Logged in, a direct page open appears to end the session; a page can show Logout after the session has ended | Work through the page the user reached; check the session by a request |
| Power and network failures happen, as today, twice | Resume is first-class, and tested by pulling the network |
| Some denied or empty pages are normal ("not exists or un-authorized") | A recorded per-row outcome, not a stop |

## Stages

Each stage ends when its tests pass **and** the owner has done its check.

| Stage | What gets built | Tasks | Owner's check at the gate |
|---|---|---|---|
| **B1 Site Profile** | Schema, and the five flows' entries: filters, label variants mapped to fields, clusters, rules (mandatory filters, D21/D22 limit), units, date formats | M1-T01, T05, T06 | Reads the cluster and column lists; corrects any wrong meaning |
| **B2 Test bed** | Cleaner that strips personal data; saved pages for **every known layout** (tender, RFQ, REOI, RFP, RFA, PPS, framework, amendments, cancelled, denied; old, mixed and new contracts); fake portal replaying them, with faults | M1-T07, T08, T10; M2 | Spot-checks two cleaned pages for personal data |
| **B3 Live filters and panel** ← **first demo** | Side panel; live scan, apply and rescan (D18); trees; login-state detection; Flow 2 warning (D33); mandatory rules | M3, M13-T01–T03 | **All five pages live:** filters match, changes apply, warnings appear |
| **B4 Engine** | Store, state machine, checkpoints, resume after crash, power or network loss; session check by request | M4, M5, M12 skeleton | Closes Chrome and pulls the network mid-run on the fake portal; it resumes with nothing lost |
| **B5 List collection** | Fast-path list at size 100; distinct-count check; **row-loss fix chosen by test** (repeat sweep against date windows); full-sweep test on Flows 3–5 | M6 | Small live runs: row counts match the portal |
| **B6 Detail collection** | Checkerboard (D32); detail pass with label variants; merge to one row; amendments; multi-lot flag; denied pages recorded | M7, M13-T11 | Spot-checks rows of each layout against the page |
| **B7 Estimate and sprints** | Count, range, warnings, ways to shorten, sprint planner (D27) | M13-T08–T10, M8-T06 | Estimates look believable on real searches |
| **B8 Safe speed and recovery** | Pacing with a per-query baseline, recovery steps, login-wall pause, slow-search tolerance, CAPTCHA stop | M8 | Forced logout and network loss in a real small run |
| **B9 Excel** | About + Data sheets, filter columns, statistics, types, combine sprints | M9, M10 | Opens real files in Excel and does both analyses (PE, contractor) |
| **B10 Self-check and maintenance** | Pre-run check, change report, hidden mode, apply and roll back a repair | M11, M12 | Breaks a setting; the run refuses and names it |
| **B11 Full runs and handover** | Full live runs, test report, guides, fresh-PC install, training material | M14 | Runs every flow unaided |

**Why this order:** B3 gives the owner something visible early. B4 comes before collection, so that nothing depends on luck. B6 comes right after B5, because detail data is the point of the tool. Excel is late, but its format is already agreed from the demos.

## Standing rules while building

- Against the fake portal first. Live checks use the smallest selection that proves the point, and only at a gate.
- `npm run verify` before every commit; a failed check blocks the commit.
- Every deviation is told to the owner when it happens (D28).
- Progress goes in `EXECUTION_PLAN.md` §12 after each step.

## Known gaps carried into the build

| Gap | Handled in |
|---|---|
| Rare layouts unseen; Flow 3 Services has 1 page, Flow 2 RFP has 4 | Unknown labels are reported on the About sheet, so gaps surface in real use |
| Whether login reveals TSTM, DC, SSS and CSO: PWD has none, so the study can't say | Warning says "may" (D33) |
| Row-loss fix not chosen | B5, by test |
| Midnight logout: reset or chance | B8; handled either way, since a lost session pauses and resumes |
| Detail response time is measured only roughly | B7, replaced by real timings |
