# Recon R3 — Flow 2: Tender Info

**Session:** R3, 2026-11-05 · **Driver:** owner, **logged out** (D11) · **Observer:** Claude over CDP
**Status:** [x] R3 done. List, pagination, empty result, two notice types and the Category tree are captured; D13 is confirmed by the owner. Left for later, not blocking: field differences across the remaining event types (PQ, RFP, PPS).

## Client requirement (owner, 2026-11-05)

**All filters are needed in the extension panel.** Unlike Flow 1, this page is well designed, so nothing is hidden.

**D12. "All" on a filter means leave it blank: one sweep through the result pages** (owner's choice, option A). No looping over filter values, so a filter left on "All" causes no extra requests. Excel rows still show Ministry, Department, PE, Type and Method from the row itself. Flow 1 still loops offices, because that page has no "all offices" option. ToR Spec 2 words "All" as iterating every value; the owner, as client, accepts blank as equivalent for this flow.

**Status is a dropdown in the panel, default All** (owner, 2026-11-05). The page's Live / Archive / Cancelled / All tabs become one more filter, sending `viewType` = `AllTenders` unless changed. The page itself defaults to Live; the extension doesn't.

**Field palette** (owner, 2026-11-05). The user chooses which notice fields to collect from a wide list (section D), and the extension loops through the notice page of every result row. If no notice field is ticked, it skips the notice pages entirely and only sweeps the list, which is far quicker. The last selection is remembered between runs. Module note: this adds a palette component to M13 and a field selection to M7.

**D13. Mandatory Department and date window** (owner, 2026-11-05; span revised from 3 to 5 years). Start is refused unless **Department** is selected and a date window is set, with a span of **at most 5 years**. Measured at 3 years: PWD, status All, published 01/01/2023–31/12/2025 = **2,274 pages ≈ 22,700 tenders** (≈2 h for the list, ≈19 h with notices). Five years is roughly 1.7× that, so a full-span PWD run with notices is of the order of **30 h** and must be paced and resumable (M8/M5).

- **Which window:** the mandatory one is the **Publishing date** window (`pubDtFrm` / `pubDtTo`). The Closing date window stays an ordinary optional filter. *(Claude's reading of "date_1 to date_2"; one word from the owner changes it to Closing.)*
- **"Current date" checkbox** (owner, 2026-11-05): each of the two date boxes has its own checkbox labelled *current date*, **ticked by default**. Ticked, that end of the window is today's date, re-evaluated when the run starts, not when the box was ticked. Unticked, the user types a date and the box is required.
- Both ends therefore always resolve to a value: an unset end means today.
- From must be before To (the portal's own rule). Format `dd/mm/yyyy`.
- The 5-year check runs on the **resolved** dates, so "current date" on both ends is a zero-length window: valid, and it means "published today". The panel shows the resolved span (e.g. *4 y 11 m*) next to the boxes so the user sees what they are about to run.
- **Exemption:** a Tender/Proposal ID or Reference No. search needs no window, because it already targets one tender. Department stays mandatory for those searches as well, as the owner has not exempted it.

**D14. One row per tender** (owner, 2026-11-05). Multi-lot tenders don't exist in e-GP yet, so the lot fields are single values in the row. If a notice ever shows more than one lot, the extension must not silently keep only the first: it flags the row in the reconciliation report so the rule can be revisited.

## A. Identity

| Item | Finding |
|---|---|
| Route | Homepage → search dropdown on eTenders → Advanced Search |
| URL | `/resources/common/AllTenders.jsp?h=t`, title "Advanced Search for eTenders/eProposals" |
| Direct GET | Yes (plain link in the top menu, no session needed) |
| Logged-out signature | The login form `#txtEmailId` / `#txtPassword` / `#btnLogin` is on this page too |

## B. Filters

Every filter is sent on every request. Blank (or `0` where noted) means "no restriction".

| # | Label | Control | Request field | Values | Blank |
|---|---|---|---|---|---|
| 1 | Select Ministry/Division/Organization | read-only `#txtdepartment` + hidden `#txtdepartmentid`, filled from a **tree popup** | `departmentId` | any tree node, e.g. PWD = `21` | empty |
| 2 | Procuring Entity | `select#cmbOffice` | `office` | **depends on 1**; starts with only the placeholder; PWD gives 224 + placeholder | empty |
| 3 | Budget Type | `select#budgetType` | `budgetType` | Development, Revenue, Own Fund (value = the text) | empty |
| 4 | Procurement Nature | `select#procNature` | `procNature` | Goods `1`, Works `2`, Service `3`, Physical Services `4` | empty |
| 5 | Procurement Type | `select#cmbType` | `procType` | NCT, ICT | empty |
| 6 | Procurement Method | `select#cmbProcMethod` | `procMethod` | RFQ `1`, OTM `2`, LTM `3`, TSTM `5`, QCBS `6`, LCS `7`, SFB `8`, DC `9`, SBCQ `10`, SSS `11`, IC `12`, CSO `13`, DPM `14`, OSTETM `15`, RFQU `16`, RFQL `17` (no `4`) | `0` |
| 7 | Framework Agreement | `select#cmbIsFrame` | `isFrame` | Yes `1`, No `2` | `0` |
| 8 | Tender/Proposal ID | text `#tenderId` | `tenderId` | numeric, checked client-side | empty |
| 9 | Reference No | text `#refNo` | `refNo` | free text | empty |
| 10 | From / To Publishing Date | text `#pubDtFrm`, `#pubDtTo` | `pubDtFrm`, `pubDtTo` | `dd/mm/yyyy`, From must be before To | empty |
| 11 | From / To Closing Date | text `#closeDtFrm`, `#closeDtTo` | `closeDtFrm`, `closeDtTo` | same format | empty |
| 12 | Category | read-only-by-habit text `#txtaCPV` (name `cpvCat`), filled from a **popup tree** via `loadCPVTree()` | `cpvCategory` | a **`;`-separated list of category names** (not codes); see below | empty |
| 13 | Status tab | links `test(1)` Live, `test(2)` Archive, `test(4)` Cancelled, `test(3)` All; hidden `#viewType` | `viewType` | `Live`, `Archive`, `Cancel`, `AllTenders` | default `Live` |

**Search validation (client-side):** at least one filter must be set; the Status tab doesn't count. `tenderId` must be numeric.

### Department tree

- The icon opens `/resources/common/DeptTree.jsp?operation=homeallTenders` in a popup (jsTree).
- Branches load on demand: `/getDataForTree?id=<node id or 0>&showPrNd=false`. Each node is `<li id="deptid_<id>" dname="<name>" dtype="Ministry|…">`.
- Selecting **any** node writes `dname` and the id back to the main page, calls `window.opener.loadOffice()`, and closes the popup. The extension doesn't need the popup: it can read the tree from that endpoint and show its own picker.
- Node-selection depth is the user's choice, so a whole ministry can presumably be chosen. To verify.

### Dependency

```
Department ──(POST /ComboServlet  departmentId, funName=officeCombo → <option> HTML)──► Procuring Entity
```

No other dependent filters found.

### Category tree (CPV), captured 2026-11-05

The **Select Category** link runs `loadCPVTree()` → `window.open('CPVTree.jsp', 'CPVTree', 'width=700px')`, a **separate popup window**. It is a jsTree with `plugins: themes, json_data, ui, checkbox` and `checkbox.two_state = false`, so **several nodes at any depth can be ticked**.

| Item | Finding |
|---|---|
| Popup URL | `/resources/common/CPVTree.jsp` (plain GET, no session) |
| Root level | **61 categories, already in the popup's initial HTML.** Each node is `<li id="<node id>" cpvcode="45000000" cpvname="Construction work">` |
| Children | on demand: `GET /GetCpvTree?id=<node id>&searchBy=&action=&keyword=` |
| Keyword search | form POST to `CPVTree.jsp` with `action=search`, `keyword=<text>`; no match replaces the tree with "No Records Found" |
| Expansion of a ticked node | `GET /GetCpvTree?action=getChildData&cpvdesc=<category name>` returns that node's descendant **names** as a `;`-joined string |
| Confirm | `input#btnGetCheckedNode` ("Submit") writes the result into the opener's `#txtaCPV` and closes the popup |

**What the filter value actually is.** Ticking one root node, **"Construction work"**, produced a **1,085-character string of 27 names**: the ticked parent followed by its level-2 descendants, `;`-separated. The search POST sends that whole string as `cpvCategory`. So the portal filters categories **by name, not by code**, and `cpvcode` is decoration.

**Consequences for the extension**
- The panel needs its own category picker; it must **not** open the portal's popup. It can fetch the same data: the 61 roots from `CPVTree.jsp`, children from `/GetCpvTree?id=…`, and a ticked node's expansion from `/GetCpvTree?action=getChildData&cpvdesc=…`.
- It must reproduce the portal's string exactly: checked names joined by `"; "`, then `";"`, then the server's expansion string with its trailing separator removed. Simplest safe rule: build the string the same way and send it verbatim; never re-split it.
- **Parsing trap:** category names can themselves contain `"; "` (e.g. *"Supporting and auxiliary transport services; travel agencies services"*), so splitting the value on `;` is ambiguous. Keep the list as an array of chosen names in our own state and only ever serialise it.
- The value grows fast: one root category is already ~1 KB. A broad selection could produce a very long POST field. Worth a length guard, and worth measuring once if a user picks many roots.
- The tree depth is at least 3 (the Submit handler walks level 1, level 2 and their children), and `getChildData` flattens whatever is below a ticked node, so **the extension does not need to walk the tree to the leaves** — ticking a parent is enough.

## C. Search and results

| Item | Finding |
|---|---|
| Request | `POST /TenderDetailsServlet`, `funName=AllTenders`, all filters, `pageNo`, `size`, `h=t`. Form-encoded, ~30 ms, no session needed |
| Response | HTML `<tr>` fragment appended to `#resultTable` (**fast path**), not JSON |
| Page size | Hidden `#size` = 10. **Q3 open:** whether the server honours a larger `size` |
| Pagination | `#btnFirst/#btnPrevious/#btnNext/#btnLast`, `#dispPage` + `#btnGoto`, "Page `#pageNoTot` of `#pageTot`". Total pages come from hidden `#totalPages` in the fragment |
| Total | **Only total pages, no record count**. The oracle is pages: last page reachable, and (pages − 1) × size < rows ≤ pages × size |
| Empty | Fragment holds `#noRecordFound` with value `noRecordFound`; the page then hides `#pagination`. To capture |
| Default volume | Live, no filters: 351 pages ≈ 3,500 rows |

### Result columns (`table#resultTable`)

Each cell packs several values separated by `<br>`, so one column becomes several Excel fields.

| Col | Header | Values |
|---|---|---|
| 1 | S.No. | row number |
| 2 | Tender/Proposal ID, Reference No | ID, reference, status label (e.g. Live) |
| 3 | Procurement Nature, Title | nature, title (link to the detail) |
| 4 | Ministry, Division, Organization, PE | up to four `<br>` separated levels, **and the count varies**: DGHS shows 4 (Ministry, Division, Organization, PE), PWD shows 3 (Ministry, Organization, PE). Map first = Ministry and last = PE; the middle levels need a rule |
| 5 | Type, Method | e.g. NCT, OTM |
| 6 | Publishing Date and Time, Closing Date and Time | `dd-Mmm-yyyy HH:mm` |

**Natural key candidate:** Tender/Proposal ID.

## D. Detail page

| Item | Finding |
|---|---|
| How it opens | Title link submits a per-row form: `POST /resources/common/ViewTender.jsp`, `id=<tender id>`, `h=t`, `target="_blank"` |
| Deterministic? | **Yes** (Q2): only the tender ID is needed, so the extension can send it directly. Whether a GET also works is to be checked |
| Page | Title "View IFT /PQ / REOI / RFP / PPS Notice Details", same URL for every tender (the ID is only in the POST body). No login needed. Links: Documents (`/LotPckDocs.jsp?tenderId=<id>`, out of scope), Save As PDF |
| Layout | Six tables, five `table.formStyle_1` (label cell followed by value cell, 1 or 2 pairs per row) and one `table.tableList_1` for lots. No element ids, so fields are located **by label text** |

### Field palette (from the notice)

| Group | Fields |
|---|---|
| Identity | Tender/Proposal ID, App ID, Invitation Reference No., Tender/Proposal Status, Event Type, Invitation for (e.g. "Tender - Single Lot") |
| Organisation | Ministry, Division, Organization, Procuring Entity Name, Procuring Entity Code, Procuring Entity District |
| Procurement | Procurement Nature, Procurement Type, Procurement Method, Budget Type, Source of Funds |
| Project and package | Project Code, Project Name, Package No. and Description, Category |
| Dates | Publication, Document last selling/downloading, Pre-Tender meeting Start, Pre-Tender meeting End, Closing, Opening, Last date for Security Submission |
| Terms | Eligibility of Tenderer, Brief Description of Works, Evaluation Type, Document Available, Document Fees, Pre-Qualification Document Price, Tender/Proposal Document Price, Mode of Payment, Name and Address of Office(s) for security submission, Security Valid Up to, Tender/Proposal Valid Up to |
| Lots (one-to-many) | Lot No., Identification of Lot, Location, Tender/Proposal Security (BDT), Tentative Start Date, Tentative Completion Date |
| Official | Name, Designation, Address, City, Thana, District, Country of the official inviting the tender |

**Parsing notes from the sample**
- **Fields vary by event type.** A REOI sample (Services, QCBS) uses different labels: "REOI No." not "Invitation Reference No.", "REOI Publication", "EOI Closing", "EOI Opening", "Eligibility of Consultant", "Brief Description of assignment". It adds Contract Type, Development Partner, "Request for expression of interest for selection of", "Experience, Resources and delivery capacity required", "Other details", "Association with foreign firm". Its lots table is also different: Ref. No., Phasing of service, Location, Indicative Start Date, Indicative Completion Date. So the palette needs **one field mapped from several labels**, plus the REOI-only fields. Still unsampled: PQ, RFP, PPS.
- Lots table: 6 headers but **7 cells per data row** in the sample (the security amount appears twice; a hidden column is likely). Mapping by position would shift the dates. To inspect in the markup.
- "Pre-Qualification Document Price" appears twice with an empty value, and the label run together ("…(In BDT)Tender Document Price (In BDT)"). Likely hidden rows.
- Empty values appear as blank cells, and also as "Not applicable" (Project Code). Whether that one is exported as text is a decision.
- Official's name is personal data in a public notice. It is fine in the output; the fixture sanitiser must still strip it, since this repo is public.
- Sample has one lot, and multi-lot tenders do not exist yet (D14).

## Recorder gap to resolve

The first network recording logged neither `/ComboServlet` (main tab) nor `/getDataForTree` (popup tab) when the department was chosen, and it also missed the filtered Search, although all of them worked on the page. Those endpoints come from the page's own code. Cause not known. `watch` now reports `LINK LOST` if its connection to Chrome closes; before this, the file kept being rewritten and looked healthy. A restarted recording attached to the already-loaded page did capture the next page request.

**Partly explained, 2026-11-05.** Recording the CPV popup ended with `LINK LOST after 78 s (code 1006)` at exactly the moment Submit closed the popup. A recording dies with its target, so **any popup-based step must be captured before the popup closes**, and the close itself looks like a fault. That is almost certainly what happened with `/getDataForTree` in the department popup last night. **Closed, 2026-11-05.** On Flow 3 the same three calls — `/ComboServlet`, `/APPServlet` and `/SearchServlet` — were all captured cleanly on the main tab in one 9-minute recording started **before** the clicks. So the recorder is sound; the earlier miss was a stale or dead attachment, which `LINK LOST` now makes visible. Rule: start the recording immediately before the clicks, and treat a recording older than the page as void. Also seen: the Submit handler fires `getChildData` **twice** for the same node, matching its code, which calls the endpoint once in the loop head and again in the level-1 branch.

## Open

- [x] Filtered search: PWD + Mymensingh PWD Division, Live = 2 pages, 10 rows on page 1
- [x] Last page: page 2 of 2 has 9 rows (19 tenders), `cntTenBrief` = rows on the page. So `totalPages` is exact, and the per-page row count is available in every response.
- [x] Empty result: `<td id="noRecordFound" value="noRecordFound">No records found</td>` with hidden `totalValue` = 0 and `totalTender` = 0, and **no `totalPages`**. Tested with Tender ID 999999999. Tender ID `1` is **not** empty: it's a real 2011 LGED tender with status "Contract Awarded", so status values go beyond the four tabs
- [x] Detail page fields. [x] List page after the detail closes: **stays on page 2** (owner). [ ] Multi-lot sample; other event types
- [x] Multi-lot: the owner confirms multi-lot tenders don't exist in e-GP yet (D14)
- [x] Measured a 3-year window (D13)
- [x] Category tree (`loadCPVTree`): popup `CPVTree.jsp`, 61 roots, children from `/GetCpvTree`, value = `;`-separated **names**; one root = 27 names, 1,085 chars (captured 2026-11-05)

## Volume (measured 2026-11-05)

| Selection | Pages | Tenders | List sweep alone | With notice pages |
|---|---|---|---|---|
| All tab, no filters | 63,889 | ≈ 639,000 | ≈ 2 days | ≈ 2–3 weeks non-stop |
| Live tab, no filters | 351 | ≈ 3,500 | ≈ 15 min | ≈ 3 h |
| PWD + one division, Live | 2 | 19 | seconds | ≈ 1 min |

Estimates assume about 2–3 s per request at a polite pace. The real pace is set in M8.

- This is about 130× the contract's stated scale ("a few thousand records", D5 under 5,000 rows per sprint). Default status All therefore makes the size of an unfiltered run a real risk: Excel writing in the browser is untested at this size, and the Excel row limit (1,048,576) comes into reach if lots become rows.
- The portal's own Search refuses to run with no filter set (the Status tab doesn't count). Its unfiltered list appears only on page load.
- A sweep this long overlaps new publications, which push rows onto later pages. Dedupe by Tender ID removes the repeats; the sweep must not assume a fixed page count.
- The panel always knows the size before starting: `totalPages` from page 1 gives the estimate.
- [ ] Field differences across the remaining event types (PQ, RFP, PPS)
