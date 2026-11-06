# e-GP portal limitations

**Asked by the owner, 2026-11-06.** A register of what doesn't work, or works strangely, on the portal itself. The owner will ask Claude to re-audit these periodically. **When one is fixed, the extension gets the improvement in its "If fixed" column.**

**To audit:** ask Claude to "audit EGP_LIMITATIONS". For each row, run its check with the smallest request that proves it, at a polite pace; update "Last checked" and its status; and list what changed. Anything newly fixed is proposed to the owner before it changes the extension. New faults get new rows.

**Status:** 🔴 still there · 🟢 fixed · ❓ not confirmed. **"Deliberate?"** is Claude's guess: some of these may be policy, not faults, which only the portal's owners can settle.

## Filters that don't work

| ID | Where | What's wrong | Evidence | Deliberate? | How to check | What the extension does | If fixed | Status · last checked |
|---|---|---|---|---|---|---|---|---|
| **E1** | Flow 2 Framework Agreement | Yes and No both return nothing, in both login states, though framework tenders exist | 0 pages each way; same filter on Flow 4: Yes 161, No 44,642 | No | Flow 2 search with Framework = Yes | Warns beside the filter | Remove the warning; the filter becomes usable | 🔴 2026-11-06 |
| **E2** | Flow 2 Budget Type, **logged in** | Every value returns the unfiltered total | PWD logged in: all three 8,913 pages. PWD logged out: 780, 2,562, 36 | No | Logged in, PWD, Budget = Own Fund: is it fewer than the total? | Warns when logged in | Remove the warning | 🔴 2026-11-06 |
| **E3** | Flow 1 Programme, Project | Choosing one often returns nothing | Owner's report; all-zero result in R2 | No | Flow 1, one office, one Programme with known work | Hides both filters (owner's decision) | Consider showing them | 🔴 2026-11-04 |
| **E4** | Flow 1 Quarter | The option "Q2 and Q3 and Q4" has a typo in its code, so it sends its text and not a date range | Page code, R2 | No | Read the option's value | Quarter is hidden and left as the page has it | Could offer Quarter | 🔴 2026-11-04 |
| **E5** | Flow 1 PE Office | Changing it doesn't refresh the Project list, which depends on it | Page code, R2 | No | Change office; does a request fire? | Project is hidden | Could offer Project | 🔴 2026-11-04 |

## Records you can't reach

| ID | Where | What's wrong | Evidence | Deliberate? | How to check | What the extension does | If fixed | Status · last checked |
|---|---|---|---|---|---|---|---|---|
| **E6** | Flow 2, logged out | **Lists only 7 of 16 methods.** RFQ, LTM, TSTM, DC, SSS, CSO, DPM, RFQU, RFQL return nothing, though the Method dropdown offers them, with no message | R8, like for like: PWD 3,377 pages logged out, 8,913 logged in. The gap is LTM 5,022, RFQU 465, RFQ 43, RFQL 8, DPM 2 | **Hiding: possibly. Offering them with no message: no** | Logged out, Method = LTM | Warns at the start of the flow (D33) | Remove or narrow the warning; logged-out runs become complete | 🔴 2026-11-06 |
| **E7** | Flow 2 notice | A cancelled tender's notice can refuse with "This tender is not exists or You are un-authorized" | 1 of 14 cancelled sampled | Possibly | Reopen a cancelled notice | Records it on that row; continues | Fields fill normally | 🔴 2026-11-06 |

## Lists and paging

| ID | Where | What's wrong | Evidence | Deliberate? | How to check | What the extension does | If fixed | Status · last checked |
|---|---|---|---|---|---|---|---|---|
| **E8** | Flow 2, and probably 3–5 | **Paging can lose rows.** The sort has no tie-break, so tied timestamps can repeat a tender on two pages and drop another | Service, 639 tenders: size 10 lost 7, size 100 lost 1 | No | Full sweep of a small search; distinct IDs against the total | Counts them against the total; recovers (B5); never exports a silent shortfall | Drop the recovery step; runs get quicker | 🔴 2026-11-05 |
| **E9** | Flow 3 | On an empty result, the page count isn't updated | Stays at 17,391, R4 | No | Search with no matches | Detects empty by its marker | None needed | 🔴 2026-11-05 |
| **E10** | Flow 5 | The Search button forces the page size back to 10 | Page code, R6 | Possibly | Read `btnSearchClick()` | Sends its own request | None needed | 🔴 2026-11-05 |
| **E11** | Flow 2 logged in | The page-size box is captioned "Total Records", which it isn't. There's no record count anywhere | R7 | No | Read the caption | Computes the exact total itself | Could read the portal's count | 🔴 2026-11-05 |

## Speed and sessions

| ID | Where | What's wrong | Evidence | Deliberate? | How to check | What the extension does | If fixed | Status · last checked |
|---|---|---|---|---|---|---|---|---|
| **E12** | Flow 5 | Search with Tender Type All can be very slow | One took 54 s; text matches 2–6 s | No | Time one such search | Tolerates slowness; estimates allow for it | Estimates shorten | 🔴 2026-11-06 |
| **E13** | Session, logged in | Opening a page directly in a new tab appears to end the session (SessionTimedOut.jsp). **Seen once;** it may have another cause | R8 run 5 | Possibly security | Needs a login: open a page directly, then test the session | Works through the page the user reached | Fewer restrictions | ❓ 2026-11-06 |
| **E14** | Session, logged in | A session ended at midnight with no user action. **Seen once.** The owner's view: a system reset | R7 | Possibly | Stay logged in across 12:00 | A lost session pauses and resumes | Long Flow 1 runs need no re-login | ❓ 2026-11-06 |
| **E15** | Session | A page keeps displaying Logout after the session has ended | R8 run 5 | No | After a session ends, read the page, then send a request | Checks by a real request | None needed | 🔴 2026-11-06 |

## Pages and data

| ID | Where | What's wrong | Evidence | Deliberate? | How to check | What the extension does | If fixed | Status · last checked |
|---|---|---|---|---|---|---|---|---|
| **E16** | Flow 4 detail | **Several layouts at one address**, with a mixed period Oct–Dec 2025. Older contracts have **no Tenderer ID** | R8, 280 pages | A portal update, probably | Open one old and one new contract | Reads whichever labels exist; `Older:` columns (D31) | If old records gain Tenderer ID, the contractor journey no longer needs the Tender ID link | 🔴 2026-11-06 |
| **E17** | Flow 2 notice | "Being processed" notices often omit their status row (15 of 25) | R8 | Unknown | Sample such notices | Status comes from the list | None needed | 🔴 2026-11-06 |
| **E18** | Flow 2 notice | Lots table has 6 headers and 7 cells per row | R3, one sample; cause not read yet | No | Read the markup | Maps by header (B6) | Simpler parser | ❓ 2026-11-04 |
| **E19** | Flow 3 detail | The field "Procuring Entity" holds a person's name, while the list column of the same name holds the office | R4 | No | Compare both | Leaves it out (D17) | Could collect it | 🔴 2026-11-05 |
| **E20** | Flows 4, 5 calendar | Dates may move past Fridays and Saturdays: asked 01/01/2021, sent 03/01/2021. Could be how they were picked | R5, R6 | Unknown | Pick a Friday in the calendar | Sends its own dates | None needed | ❓ 2026-11-05 |
| **E21** | Flow 1 | An empty result is a table of zeros, not "no records" | R2 | Possibly | Search one with nothing | Treats all zeros as empty | None needed | 🔴 2026-11-04 |

## Audit log

| Date | Audited by | Rows checked | Fixed | New | Notes |
|---|---|---|---|---|---|
| 2026-11-06 | Claude | register created, from R2–R8 | — | E1–E21 | Baseline |
