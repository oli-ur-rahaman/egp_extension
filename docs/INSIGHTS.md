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
