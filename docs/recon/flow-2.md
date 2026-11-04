# Recon R3 — Flow 2: Tender Info

**Session:** R3, 2026-11-05 · **Driver:** owner, **logged out** (D11) · **Observer:** Claude over CDP
**Status:** [~] in progress. Filters, department tree, list request and pagination read. Still to capture: a filtered search, last page, empty result, detail page, list page after the detail closes.

## Client requirement (owner, 2026-11-05)

**All filters are needed in the extension panel.** Unlike Flow 1, this page is well designed, so nothing is hidden.

**D12. "All" on a filter means leave it blank: one sweep through the result pages** (owner's choice, option A). No looping over filter values, so a filter left on "All" causes no extra requests. Excel rows still show Ministry, Department, PE, Type and Method from the row itself. Flow 1 still loops offices, because that page has no "all offices" option. ToR Spec 2 words "All" as iterating every value; the owner, as client, accepts blank as equivalent for this flow.

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
| 12 | Category | `#txtaCPV`, filled from `loadCPVTree()` | `cpvCategory` | not yet inspected | empty |
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
| Fields | Not yet captured |

## Recorder gap to resolve

The network recorder logged neither `/ComboServlet` (main tab) nor `/getDataForTree` (popup tab) when the department was chosen, and it also missed the filtered Search, although all of them worked on the page. So the session's capture stops after the first page load, and the endpoints above come from the page's own code. Cause not known yet. `watch` now reports `LINK LOST` if its connection to Chrome closes; before this, the file kept being rewritten and looked healthy.

## Open

- [x] Filtered search: PWD + Mymensingh PWD Division, Live = 2 pages, 10 rows on page 1
- [ ] Last page, empty result
- [ ] Detail page fields; list page after the detail closes
- [ ] Category tree (`loadCPVTree`)
