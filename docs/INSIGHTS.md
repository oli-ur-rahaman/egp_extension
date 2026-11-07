# Insights and ideas

What we've learned about e-GP that should shape the build, in one place. Each entry links to its evidence. Add to it as soon as something is learned; the flow notes in `docs/recon/` hold the detail, and decisions are in `PROJECT_PLAN.md` §8.

**Status marks:** ✅ measured on the live portal · 📖 read from the page's code, not yet seen on the wire · 💡 idea, not yet proven.

## Getting complete data

| # | Insight | Status | What the build must do |
|---|---|---|---|
| 1 | **A list sweep silently loses rows.** The portal sorts by timestamp with no tie-break, so tied rows land differently per request. Service, 639 tenders: size 10 lost 7, size 100 lost 1, and both together gave exactly 639 | ✅ Flow 2 | Never trust a single sweep. Assume every paged list does this until tested. [flow-2](recon/flow-2.md) |
| 2 | **The exact total is computable:** (pages − 1) × size + rows on the last page. It holds across page sizes (Works 444,303 at sizes 10 and 100) | ✅ Flows 2, 3 | This is the completeness check: distinct IDs must equal it, or the run reports how many are missing. Never a silent shortfall |
| 3 | Repeating a sweep at a different size and combining the results recovers lost rows | ✅ Flow 2, one case | Fallback for any flow. Costs a full list sweep each time |
| 4 | Date windows that each fit on one page have no page boundary, so can't lose rows this way | 💡 | Test when building M6. Flow 2 has a mandatory date window already. Flow 3 has no date filter |
| 5 | **New uploads shift rows during a run** (owner). Live grew from 358 to 359 pages in one session. A sweep lasting hours will see this. Uploads push rows down, which causes repeats, not losses | ✅ | Dedupe by the natural key; don't assume a fixed page count. Read `totalPages` from each response |
| 6 | Tender IDs are unique in e-GP (owner). **APP ID is not:** 50 rows held 16 APP IDs, since one APP has many packages | ✅ | Natural key per flow: Tender ID on Flow 2; package ID on Flow 3 |
| 7 | e-GP has no multi-lot tenders or packages yet (owner) | owner | One row each. If more than one lot ever appears, flag it; never drop it (D14, D16) |

## What the output is for (owner, D24)

| # | Insight | Status | What the build must do |
|---|---|---|---|
| 49 | Two main uses: tenders by a department's PEs, and one contractor's whole journey in e-GP | decided | PE and contractor must be clean, consistent columns in every flow |
| 50 | The contractor journey depends on one ID across flows. Flow 5 calls it Company Unique ID; Flow 4's detail calls it Tenderer ID, **only on newer contracts**: older ones have no such field. **They are the same number** (one exact match, 2026-11-06). Tender ID also links the same contract across Flows 4 and 5: same company, Contract No and value on one sample | ✅ | Join on Company Unique ID where present; for contracts with no Tenderer ID, go through Tender ID into Flow 5 |
| 56 | LTM work is public elsewhere: a logged-out LTM record on Flow 5, and the same tender's contract on Flow 4, though Flow 2 hides LTM tenders. Confirmed widely by R8 | ✅ | Don't generalise "LTM is hidden" beyond Flow 2 |
| 55 | **A detail page can have several layouts** at the same URL (three seen): Flow 4 older contracts have Contract No, tender counts and supplier location; newer ones have Tenderer ID and Beneficial Ownership | ✅ | One palette field maps from several labels; a missing label is empty, never a failure. Fail-loud must not fire on a known layout |
| 51 | Detail data is the point of the tool (D25), and it's slow: PWD Flow 4 ≈ 59 h for every detail page at 3 s each | ✅ estimate | Show the estimate beside the checkerboard. Resume must be solid for runs lasting days |

## What changes a detail page's format (R8, `recon/r8-format-study.md`)

| # | Insight | Status | What the build must do |
|---|---|---|---|
| 57 | Flow 2: Nature, and for Services the notice kind (REOI, RFP, RFA), PPS for Physical Services; Status removes a little; amendments add a block | ✅ 223 pages | One tick per meaning; the profile maps label variants |
| 58 | Flow 3: Nature, and Method for the RFQ family. Not year, budget or type | ✅ 69 pages, Services thin | Same |
| 59 | Flow 4: contract date, with a mixed period Oct–Dec 2025. Not method | ✅ 280 pages | Read labels; never assume by date |
| 60 | Flow 5: uniform, 28 labels. **Work Status doesn't change it.** Only a late-2025 ownership table | ✅ 103 pages | Simplest parser |
| 61 | **Logged-out Flow 2 lists only 7 of 16 methods;** RFQ, LTM, TSTM, DC, SSS, CSO, DPM, RFQU, RFQL return nothing | ✅ | The D30 warning should cover more than LTM |
| 62 | **Flows 4 and 5 list most of those methods logged out:** LTM 19,677 pages on Flow 4 (size 20). Flow 4 shows 11 of 16 methods, Flow 5 shows 7. **TSTM, DC and CSO have no records on Flows 2, 4 or 5,** so they may be unused rather than hidden. An empty search reports 1 page on Flows 4 and 5, so never read 1 as one page of records | ✅ corrected | For a contractor's journey, Flows 4 and 5 are fuller than Flow 2 |
| 63 | Flow 2's Framework Agreement filter returns nothing for Yes or No; on Flow 4 it works | ✅ | Warn in the panel, or hide it there |

| 65 | **Login changes which records you reach, not a page's fields.** PWD, same record both ways: 407 of 409 had identical labels; the 2 others gained an Action column. **Flows 3, 4, 5: same page counts on all 106 filter values.** Flow 2's gap equals the hidden methods | ✅ | One parser for both states. Flows 3–5 work in either state |
| 66 | More layouts, seen logged in: RFQ notices; framework notices with a PE offices table; Flow 5 JVCA records | ✅ | Add to the profile and test bed |
| 67 | On logged-in Flow 2, the Budget Type filter appears to do nothing: all values give the unfiltered 8,913 pages | ✅ | Warn in the panel when logged in |
| 68 | A notice can refuse with "not exists or un-authorized" | ✅ once | A recorded per-row outcome, never a stop |
| 69 | **The public share of PWD's tenders is falling:** 51% of 2023's list is public, 25% of 2025's, 21% of 2026's. Cause not measured; more LTM use is likely | ✅ share · 💡 cause | The logged-out warning matters more each year. Check against Flow 1 when real data flows |
| 70 | **Flow 3 across all years is about 1.26 million packages,** the largest list once the preselected year is removed | ✅ | Financial Year stays mandatory (D15) |
| 71 | **Flow 5 is thin for recent contracts:** eTenders, start year 2023 817 pages, 2024 153, 2026 7 (size 20) | ✅ | For recent work, the contractor journey leans on Flow 4 |
| 72 | **Page counts depend on the size they were taken at.** R8 used 20, the flow notes 10 | ✅ | Always record the size beside a page count |
| 73 | **A control can exist only inside an HTML comment.** Flow 4 Category looked real from reading the page's source. The check that found it: test each selector against the saved page | ✅ | Prove selectors on saved pages (M1-AT5), not by reading source |
| 74 | **"PE Name" means different things.** On Flows 2 and 4, Procuring Entity Name is the office (on Flow 2 it matches the list's office 3 of 3 times, and no sample shows a personal title). On Flow 3, Procuring Entity, and on Flow 5, PE Name, hold a person's name | ✅ small sample | Fields on 2 and 4; left out on 3 and 5 |
| 75 | Flows 4 and 5 keep a header row inside the results table body | ✅ | Find rows by their key, never by position |
| 76 | **Tender ID didn't repeat in saved rows:** Flow 2 1,789, Flow 4 211, Flow 5 260. **Flow 3 has no Tender ID, and 24 of 284 Flow 5 rows have none:** their cell starts with `-` or has no ID | ✅ small samples | Tender ID as the key (D39), with those exceptions. Test on full sweeps in B5 |
| 77 | **The Queries and Replies table is hidden on the page (E23):** it sits inside `display: none`, found from the owner's copy of tender 1235555. Users never see it. **The study's labels included table headers without checking whether they were hidden,** so a label on the census isn't proof that it's visible. All 4 opened said "No Record Found." | ✅ | Parser skips hidden cells, table headers too. Stays out |
| 78 | **The inviting official's block sits at the end of the notice,** under "Procuring Entity Details": Name, Designation, Address (Address, City, Thana, District, Country), Contact details (Phone No, Fax No). On 474 of 573 samples with the Tender/Proposal wording | ✅ | Collected (D40). Address and contact values are small inner tables |
| 79 | The Action column on file tables is the **download button** (owner's copy) | ✅ | Nothing to collect |
| 80 | **The department and category trees answer in JSON.** Earlier notes described how the page draws them, not the data | ✅ | The panel reads the JSON. Read the wire, not the drawn page |
| 81 | The search dropdown (`#cmbSearchTab`) is absent from the logged-in Flow 2 page, so it can't be a landmark | ✅ | Removed from page identity |
| 83 | **Flow 5's Tender Type has no change handler,** so changing it fires no search; the page reads it only at its own Search. Flow 5's Search and tabs are what load the slow query | ✅ code | Safe to apply on load |
| 88 | **The first live run worked as designed:** Flow 2, logged out, one Procuring Entity, 4 rows. Detail pages read by requests from the user's page, with no tab opening. The file opened in Excel, and one tender checked by the owner matched the portal. Small sample, logged out only | ✅ small |
| 85 | **Every real page's scripts mention "captcha",** in the login box's code (6 times on Flow 2's page). 39 saved real pages show none of the block words in visible text. So a block check must read only visible text. Our test pages have no scripts, which hid this. Still open: a real notice could show "forbidden" in its text; test this before long runs | ✅ |
| 86 | **Moving options one at a time into a Chrome dropdown leaves the last one selected,** so a refilled list silently chose its last office and filtered the real page. Replace the whole list at once, then select "no selection" | ✅ |
| 87 | **Chrome destroys a tab-specific side panel when the user moves to another tab,** so anything the panel alone holds must be saved | ✅ |
| 84 | The portal's own popups refill Procuring Entity by a page function. The panel's own picker can't call that, so it asks `/ComboServlet` and fills the list itself, as the page does | ✅ code | Other cascades (Financial Year to Project, Nature to Method) run from the page's own change handlers |
| 82 | Every notice ends with two standing sentences styled as labels | ✅ | Listed as not fields, so they aren't reported as unknown |

## Time and sprints (owner, D27)

| # | Insight | Status | What the build must do |
|---|---|---|---|
| 52 | The number of ticked fields doesn't change the time: one detail page holds them all. The choice is detail pages or none | 📖 | Say so on the checkerboard. See `TIME_ESTIMATE.md` |
| 53 | One request gives the real size of a search, so the estimate rests on facts | ✅ | Count first, then estimate |
| 54 | Long runs split naturally by date window into sprints of at most 6 hours | 💡 | Test in M6 that windows don't overlap or leave gaps |

## Speed and load

| # | Insight | Status | What the build must do |
|---|---|---|---|
| 8 | **The servlets honour a larger `size`** though the page offers no control. Size 100 means 10× fewer list requests, with matching totals | ✅ Flows 2, 3, 4 | Default list size 100. Larger not tried: the gain shrinks and a failed page costs more |
| 9 | **Detail pages don't get faster.** Each row is its own request, so the palette is the expensive part | ✅ | Palette starts empty (D15). With no detail field ticked, skip detail pages entirely |
| 10 | Response time varies by query, not just load. Flow 3: page 1 ≈ 0.2 s, last page ≈ 2.3 s. Flow 2: status All ≈ 1–1.7 s, Live ≈ 30–70 ms | ✅ | M8's "site is slowing down" check needs a baseline per query, or normal slowness reads as throttling |
| 11 | Size of unfiltered data: Flow 2 ≈ 637,000 tenders; Flow 3 173,904 packages in one year; Flow 4 ≈ 896,000 contracts | ✅ | Far beyond the contract's "few thousand". Every flow needs a mandatory-filter guard and a time estimate before Start |
| 12 | The size is known before Start: `totalPages` arrives with page 1 | ✅ | Panel shows the estimate from one request |

## Filters

| # | Insight | Status | What the build must do |
|---|---|---|---|
| 13 | **Live filters (owner's idea, D18).** Scan filters on load, apply each change to the real page, rescan all. No stored option lists | decided | The Site Profile names each filter (label, type, rule), never its items |
| 14 | A scan alone can't see tree popups, operator-plus-value filters, mandatory rules, hidden filters, or a filter that vanished | ✅ | That's why the thin profile exists. A vanished filter must stop the run (ToR fail-loud) |
| 15 | Both tree popups are avoidable: their data comes from an endpoint. Flow 2's list view can read Department without the popup | 📖 | Panel shows its own picker |
| 16 | A filter's guard differs per flow: Flow 1 year + office; Flow 2 Department + publishing window ≤ 5 years (D13); Flow 3 Department + year (D15); Flow 4 Department + sign-date window ≤ 5 years (D19); Flow 5 Department + start-date window ≤ 5 years (D20). A contractor filter lifts the requirement on Flows 4 and 5 (D21, owner's idea) | decided | Mandatory rules live in the profile, per flow |
| 17 | The panel may need a different filter set than the page: Flow 1 shows two of six; Flow 2 turns Status tabs into a dropdown, default All | decided | Panel definition is per flow, not a copy of the page |
| 18 | "All" can be a blank value, with no looping, except where the page has no such option (Flow 1 PE Office) | ✅ | D12 |
| 19 | Dropdown placeholders aren't uniform: blank, `0`, a space, or text | ✅ | Per-filter "no selection" value in the profile; never assume |
| 20 | The same concept has different vocabulary: Budget Development is sent as `1`, as `Development`, or as `Aid or Grant`, depending on the page and call | ✅ | Don't share value mappings between flows |
| 21 | Date formats differ by filter and flow: `dd/mm/yyyy` on filters; `dd-MMM-yyyy` in results; Flow 4 converts two of its dates to `yyyy-mm-dd` before sending and sends two as typed | ✅ 📖 | Format per field in the profile. The parser never guesses |
| 22 | Some portal code is broken or misleading: a Quarter option with a typo; validation commented out on Flow 3 | ✅ | Believe the wire, not the code alone |

## Reading pages

| # | Insight | Status | What the build must do |
|---|---|---|---|
| 23 | **Lists return HTML fragments** from a plain form POST, so no clicking is needed | ✅ | Fast path by default, UI path as fallback |
| 24 | **Empty isn't "no rows", and page counts lie.** Empty = `#noRecordFound`. Flow 3 leaves `totalPages` stale on empty. Flow 1 empty = a Total row of zeros | ✅ | Detect empty by its marker, per flow |
| 25 | A title can contain its own table (110 `<tr>` for 100 tenders) | ✅ | Count by ID or `cntTenBrief`, never by `<tr>`; select direct rows only |
| 26 | One cell often holds several fields, split by `<br>`. Organisation levels vary in number by department | ✅ | Splitting is part of each parser, per column |
| 27 | **Detail labels change with notice type.** REOI says "EOI Closing", tenders say "Tender/Proposal Closing", and the lots table differs | ✅ | One palette field maps from several labels. Sample PQ, RFP and PPS |
| 28 | Lots table: 6 headers but 7 cells per row on a Flow 2 notice | ✅ | Map by header, not position; inspect the hidden cell |
| 29 | The same label can mean different things: Flow 3's detail "Procuring Entity" holds a person's name; the list column holds the office | ✅ | Out of the palette by default (D17); the sanitiser strips it |
| 30 | Values aren't always final in raw HTML: Flow 1's percentages are computed by inline script | ✅ | On the fast path, compute them from the documented formula |
| 31 | Units differ: Flow 1 and Flow 4 values are in **Crore BDT**, Flow 3 in plain BDT | ✅ 📖 | Unit per column in the profile, and say it in the Excel header |
| 32 | `N.A.` and `Not applicable` appear as values | ✅ | Export `N.A.` as empty. Decide per field for `Not applicable` |
| 41 | Units can differ inside one flow: Flow 4's list is Crore BDT, its detail is full BDT with the currency in brackets | ✅ | Split amount from currency. Label units in Excel |
| 42 | Detail pages have no login form, so its absence proves nothing about login state | ✅ | Check login state on list pages only |
| 46 | The page's calendar may skip weekends: dates asked for as 01/01/2000 and 01/01/2021 went out as 02/01/2000 and 03/01/2021. Both moved past a Friday or Saturday, on Flows 4 and 5. Cause unconfirmed | 💡 | A window's edge may silently move on the page. The extension sends its own dates and must show the ones actually sent |
| 45 | **A Contains filter makes "one contractor has few results" true only for real names.** Full name 1–3 pages, `jamal` 39, `Construction` 1,922, `a` 15,491 of 18,735 | ✅ Flow 5 | Limit by the measured result size, not by what the user typed |
| 44 | A page's own Search can overwrite a field before sending: Flow 5 forces `size` back to 10 | ✅ 📖 | When testing, read the request actually sent. The extension sends its own |
| 43 | A mandatory window could hide rows with no such date, so measure it: no window against a very wide window. On Flow 4, PWD, both give 13,335 pages, so the sign-date window hides fewer than 10 of about 133,000 contracts | ✅ Flows 4, 5, PWD | Run this check for any new date guard |

## Portal and session

| # | Insight | Status | What the build must do |
|---|---|---|---|
| 33 | **Logged in, public pages show only your department; logged out, any department** (owner) | ✅ | Flows 2–5 logged out, Flow 1 logged in (D11). A wrong login state must stop the run with a clear message |
| 47 | **The same search can return very different results.** Flow 2, PWD, 2023–2025: 2,274 pages logged out, 5,733 logged in (owner's audit). Not the `office` value (tested). **The hidden ones appear to be LTM tenders:** Mymensingh logged in OTM 473 + LTM 277; logged out exactly 473; no LTM in 961 logged-out rows | ✅ gap · ✅ logged-out LTM search returns nothing, though the dropdown offers it; logged-in OTM 2,272 against 2,274. **Only Flow 2 differs:** Flows 3, 4, 5 give the same counts | Compare requests field by field before crediting a cause. See `recon/r7-logged-in-audit.md` |
| 64 | **Logged in, opening a portal page directly in a new tab may end the session:** a new tab on AllTenders went to SessionTimedOut.jsp, and the session was gone. Menu navigation and links opened from a page didn't do this. A page can still display Logout after the session has ended, so test with a request | ✅ once | The extension mustn't open pages by direct URL when logged in; work through the page the user reached. Check the session by a request, never by what the page shows |
| 48 | A session ended at midnight with no user action (owner: a nightly reset). Seen once | ✅ once | Flow 1 runs crossing midnight must expect a login wall |
| 34 | The login form is on the homepage, and a post-login page asks for mobile/NID | ✅ | Both are recognisable page states, never mistaken for a site change. Never fill them |
| 35 | Closing a detail tab doesn't disturb the list's page | ✅ Flow 2 | No need to re-apply filters after a detail |
| 36 | About 20 quick requests at a time drew no throttling or errors | ✅ small sample | Not evidence for a long run. Keep the pacing |

## Recon method

| # | Insight | Status |
|---|---|---|
| 37 | Snapshot first and read the page's own JavaScript before asking for clicks. It gives filters, cascades, the request and the detail URL, with clicks only to confirm and measure | ✅ |
| 38 | Test with the largest sets, not the smallest. Goods and Works exposed what Service hid (owner's call) | ✅ |
| 39 | When a number surprises you, read the request. "412 pages" was Department still set; "no filter" was a preselected year | ✅ |
| 40 | Start a recording right before the clicks, check its tab isn't DevTools, and remember it dies with its popup | ✅ |
