# Recon R7 — Audit of Flows 2–5 logged in

**Asked by the owner, 2026-11-05:** does a logged-in user see anything exceptional on the public pages, compared with logged out?
**Session:** owner logged in with a PWD officer account; Claude compared structure against the logged-out captures, without echoing personal data. No recording ran during login.
**Status:** [~] in progress. Flows 2 and 3 compared; Flows 4 and 5 to do.
**Limit of this audit:** it covers one account type and PWD. It can't show what other departments or roles see.

## Summary

| Flow | Filters | List columns | Row count, same search | Detail page | Verdict |
|---|---|---|---|---|---|
| 2 Tender Info | Same; Department locked to PWD | Same | **2.5× more logged in** | **Identical**, one public tender | **Login reveals more tenders** |
| 3 APP Info | Same; Department **not** locked | Same | **Same:** 1,841 pages | Same labels; not compared on one package | **Nothing extra found** |
| 4 Contract Info | | | | | |
| 5 Experience Info | | | | | |

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

**Row access: a login returns more tenders for the same search.** Both requests carry exactly the same fields: status All, Department 21, published 01/01/2023–31/12/2025.

| | Pages | Tenders (about) |
|---|---|---|
| Logged out | 2,274 | 22,700 |
| **Logged in** | **5,733** | **57,300** |

Only 2 of the 10 rows on page 1 are shared. The logged-in page shows tenders with the status **"Being processed"**, which didn't appear on the logged-out sample page. So the difference is probably tenders not yet public, though that rests on one page of rows. Also logged in: PWD, status All, no other filter = 17,826 pages. Tender IDs are deliberately not recorded here: the repo is public, and these may not be public records.

**What this changes:**
- Flow 2 data differs by login state, so D11 ("Flows 2–5 run logged out") is not neutral: for the owner's own department, logged out **misses** about 60% of tenders in this window.
- Whether those tenders belong in an export is a decision for the owner. They may be restricted to the department, and the ToR's confidentiality clause (§14) and "no data the user couldn't obtain by hand" both apply.
- Not to be tested: altering the locked Department while logged in, to reach other departments' restricted tenders. That would be going beyond what the account is given.

**A "Being processed" notice, opened logged in (one sample):** a full notice, same layout and 35 rows as the public one, with no error. Two differences: the **Tender/Proposal Status row is absent**, and there is **no Documents link**. No extra fields.

**Still to check:** whether that same tender can be found or opened logged out. Also, the status mix across the 5,733 pages: only one page has been sampled, so "the extra tenders are Being processed" is still an inference.

## Flow 3 — APP Info

Same URL, filters, columns and links. **Department stays selectable when logged in**, unlike Flow 2, and the page loads the same 17,391 pages.

| PWD, FY 2024-2025 | Logged out | Logged in |
|---|---|---|
| All natures | 1,841 pages | **1,841 pages** |
| Works | not measured | 1,775 pages |

The search requests carry the same non-empty fields. The package detail shows the labels listed in `flow-3.md` and no extra links. It's a different package from the logged-out sample, so values weren't compared.
