# Recon R7 — Audit of Flows 2–5 logged in

**Asked by the owner, 2026-11-05:** does a logged-in user see anything exceptional on the public pages, compared with logged out?
**Session:** owner logged in with a PWD officer account; Claude compared structure against the logged-out captures, without echoing personal data.
**Correction:** two recorders were believed stopped but kept running through the second login, because stopping a background job on Windows left its node process alive. A scan of all recordings found no login request and no password, email or token field. They did store two account pages (mobile/NID prompt, Message Box); those bodies were wiped on 2026-11-06. The raw folder is git-ignored and nothing reached the repo. `recon stop` now kills recorders for real, and login and account pages are never recorded.
**Status:** [x] Audit answered: only Flow 2 differs, and the reason is LTM. Open: the owner's decision, the Sunday and midnight checks.
**Limit of this audit:** it covers one account type and PWD. It can't show what other departments or roles see.

## Summary

| Flow | Filters | List columns | Row count, same search | Detail page | Verdict |
|---|---|---|---|---|---|
| 2 Tender Info | Same; Department locked to PWD | Same | 5,733 against 2,274 pages; **not the `office` value** | **Identical**, one public tender | **Logged out appears to hide LTM tenders** |
| 3 APP Info | Same; Department **not** locked | Same | **Same:** 1,841 pages | Same labels; not compared on one package | **Nothing extra found** |
| 4 Contract Info | same-search check only | same-search check only | **Same:** 7,119 pages | not compared | **Nothing extra found** |
| 5 Experience Info | same-search check only | same-search check only | **Same:** 1,578 pages | not compared | **Nothing extra found** |

## Flow 2 — Tender Info

Route when logged in: login → Update Later → Home → eTenders in the dropdown → Advanced Search. Same URL as logged out.

| Item | Logged out | Logged in |
|---|---|---|
| Filters and result columns | | Same set, same names |
| Department | `#txtdepartment` is a text box, filled from the tree | **Hidden, fixed** to the account's department (`21`), no tree |
| Procuring Entity | placeholder only until a department is chosen | **Preloaded**, 224 offices + placeholder |
| Page size | hidden `#size` | **Visible text box `#size`**, captioned "Total Records :". The caption is wrong: it's the page size, and the portal offers no record count here. It does show the portal lets users change the size |
| Extra fields | | hidden `hiddenUserType`, `uTypeId`; neither is in the search request |
| Search request | | **Same fields**, same servlet |
| Status tabs | | Same |
| Default volume | Live 351 pages (all departments) | Live 72 pages (PWD only) |
| Menus | public set | adds My Account, the officer reports and `/CascadeLinkServlet`. Not new data on this page |

**Notice page, tender 1363233:** 35 rows both ways, no label differs, no value differs, no extra links.

**Row access: the same search returned different results, cause not yet known.** Status All, Department 21, published 01/01/2023–31/12/2025. **The requests are not identical, as first written: `office` is an empty string logged in and a single space logged out**, because the placeholder values differ. Every other field matches. Being logged in, or that one space, could explain the gap.

| | Pages | Tenders (about) |
|---|---|---|
| Logged out | 2,274 | 22,700 |
| **Logged in** | **5,733** | **57,300** |

Only 2 of the 10 rows on page 1 are shared. **Correction:** "Being processed" does appear logged out too (5 of 10 rows there, 7 of 10 logged in), so that status alone isn't what separates them, and one of the absent rows is "Contract Awarded". All eight absent rows were published 31-Dec-2025. A tender absent from the list also didn't appear logged out when searched by ID. Re-run logged out on 2026-11-06: still 2,274 pages, so the gap isn't data changing. Also logged in: PWD, status All, no other filter = 17,826 pages. Tender IDs are deliberately not recorded here: the repo is public, and these may not be public records.

**What this changes:**
- If login is the cause, D11 ("Flows 2–5 run logged out") is not neutral: logged out misses about 60% of the owner's department in this window. If the space is the cause, the public page itself hides rows through its own placeholder, and the extension must send the empty value.
- If login is the cause, whether those tenders belong in an export is a decision for the owner. They may be restricted to the department, and the ToR's confidentiality clause (§14) and "no data the user couldn't obtain by hand" both apply.
- Not to be tested: altering the locked Department while logged in, to reach other departments' restricted tenders. That would be going beyond what the account is given.

**A "Being processed" notice, opened logged in (one sample):** a full notice, same layout and 35 rows as the public one, with no error. Two differences: the **Tender/Proposal Status row is absent**, and there is **no Documents link**. No extra fields.

**Still to check:** whether that same tender can be found or opened logged out. Also, the status mix across the 5,733 pages: only one page has been sampled, so "the extra tenders are Being processed" is still an inference.

**Session ended at midnight.** Logged in at 23:54 and 23:58, logged out at 00:00 (Bangladesh time), with no logout by the owner. **The owner's view: a system reset at 12 o'clock.** One observation so far; recheck another night. The owner's other theory, that opening eContracts causes it, is **disproved**: logged in again, eContracts opened and the session stayed (Logout link present). Flow 1 needs a login, so a run crossing midnight must expect this.

**Owner's request:** run the 2,274 search on **Sunday, once in the morning and once at night**. Friday and Saturday are holidays, so tonight's unchanged number says little about how fast it moves on a working day.

## Likely reason: logged out hides LTM tenders (2026-11-06)

| Evidence | Result |
|---|---|
| PWD + Mymensingh, status All, 2023–2025, logged in | 750 tenders: **OTM 473, LTM 277** |
| Same search, logged out | 4 × 100 + 73 = **473**, exactly the OTM count. The 73 on screen are all OTM |
| Logged-in page 1, PWD 2023–2025 | All 8 rows absent logged out are **LTM**, of any status; both shared rows are **OTM** |
| All 961 logged-out rows recorded, all departments | **No LTM** at all |

LTM is the Limited Tendering Method, so it would make sense for these not to be listed publicly. **Why the portal does this is an inference;** that it happens is well supported. This replaces the status and date theories: "Being processed" appears both ways because status isn't what decides it. Other restricted methods haven't been ruled out; the logged-out sample also has no RFQ or DPM, for example.

**Confirmed logged out (owner, 2026-11-06):** PWD + Mymensingh + 2023–2025, Method = LTM gives **no records**, while logged in the same office has 277 LTM tenders. **Confirmed logged in:** PWD, 2023–2025, Method = OTM gives **2,272 pages**, against 2,274 logged out with all methods. So OTM accounts for almost all of the public list, and the remaining 2 pages (at most about 20 tenders) are other methods shown publicly. The logged-in extra, 3,459 pages or about 34,600 tenders, is overwhelmingly LTM.

**Fault or design?** Unknown. For design: the rule is consistent across all rows sampled, and limited tendering invites only enlisted firms. For a fault: the logged-out page still offers LTM in its Method dropdown and then returns nothing, with no explanation. Only the portal's owners can settle it (BPPA, or the e-GP help desk).

**The method column is not private on the page:** the logged-out dropdown still offers LTM. What the panel should do follows from the owner's decision.

## Test plan: why do logged-out searches return fewer tenders?

**Asked by the owner, 2026-11-06.** Result so far: logged in with `office` forced to the logged-out space value, the search still gives **5,733** pages, so **the space is not the cause**. Login state is the leading explanation, pending T1.

**The owner's theory:** a tender drops off the public page once it has opened but its contract information hasn't been posted. **Evidence so far:** 8 tenders on one page are absent logged out, all published 31-Dec-2025; 7 are "Being processed" but 1 is "Contract Awarded"; and 5 "Being processed" tenders from 30-Dec-2025 **are** public. So status alone doesn't explain it.

| # | Test | How | Answers | Status |
|---|---|---|---|---|
| T1 | **Confirm LTM** | Logged out, Method = LTM; logged in, Method = OTM | Logged out: no records ✓. Logged in OTM 2,272 against 2,274 ✓. Replaces the reverse space test | **done** |
| T2 | The hidden list | Logged in swept: 750. Logged out: count known, 473. Tender-by-tender comparison dropped unless T1 surprises | Count matches LTM exactly | **done enough** |
| T3 | What the hidden ones share | Answered by the evidence above: method | | **done** |
| T4 | Do LTM tenders have public contracts? | Flow 4 total is the same both ways, so whatever Flow 4 shows, it shows to everyone | Whether LTM contracts are public: Flow 4 Method = LTM, one search, not yet run | optional |
| T5 | PWD-wide | T1 at PWD level: logged in OTM against 2,274 | Whether Mymensingh is typical | with T1 |
| T6 | Other departments | **Logged out only:** does a department show the same pattern of gaps in dates? | Whether this is PWD-only. Other departments' logged-in view is out of bounds | optional |
| T7 | Flows 4 and 5 | Same search both ways | Same counts both ways: Flow 4 7,119, Flow 5 1,578. Flow 3 1,841. **Only Flow 2 differs** | **done**, counts only, at PWD level |
| T8 | Sunday, morning and night | PWD + 01/01/2023–31/12/2025, logged out and logged in (owner's request) | How fast the numbers move on a working day; whether hidden tenders reappear | Sunday 2026-11-08 |
| T9 | Midnight reset | Stay logged in across 12:00 on another night | Reset or chance. Matters for Flow 1 | any night |

**Then the owner decides** (D11 review): for the owner's own department, run logged in, logged out, or offer the choice; and whether hidden tenders may go in an export, given ToR §14 and the fact they aren't public. Hidden tender IDs stay out of this public repo.

**Not tested, on purpose:** changing the locked Department while logged in, or opening a hidden tender's notice while logged out by sending its ID directly.

## Flow 3 — APP Info

Same URL, filters, columns and links. **Department stays selectable when logged in**, unlike Flow 2, and the page loads the same 17,391 pages.

| PWD, FY 2024-2025 | Logged out | Logged in |
|---|---|---|
| All natures | 1,841 pages | **1,841 pages** |
| Works | not measured | 1,775 pages |

The search requests carry the same non-empty fields. The package detail shows the labels listed in `flow-3.md` and no extra links. It's a different package from the logged-out sample, so values weren't compared.
