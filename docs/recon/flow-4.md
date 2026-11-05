# Recon R5 — Flow 4: Contract Info (eContracts)

**Session:** R5, 2026-11-05 · **Driver:** owner, **logged out** (D11) · **Observer:** Claude over CDP
**Status:** [~] in progress. Everything below comes from one snapshot and the page's own JavaScript. Not yet seen on the wire: Search, page size, detail page, empty result, volume with filters. Owner's scope questions are open.

## A. Identity

| Item | Finding |
|---|---|
| Route | Homepage search dropdown → eContracts → Advanced Search |
| URL | `/resources/common/AdvSearchNOA.jsp`, title "Advanced Search for eContracts" |
| Results on load | Yes. Hidden `#totalPages` = **89,586** at size 10 (≈ 896,000 contracts). The largest list so far |
| Logged-out signature | The login form is on this page too |

## B. Filters

| # | Label | Control | Request field | Values | Blank |
|---|---|---|---|---|---|
| 1 | Select Ministry/Division/Agency | read-only `#txtdepartment` + hidden `#txtdepartmentid`, same tree popup (`DeptTree.jsp?operation=homeallTenders`) | `departmentId` | any tree node | empty |
| 2 | Procuring Entity | `select#cmbOffice` | `officeId` | **depends on 1**, via `/ComboServlet` `funName=officeCombo` | `0` |
| 3 | Budget Type | `select#budgetType` | `budgetType` | Development, Revenue, Own Fund (value = text) | empty |
| 4 | District | `select#cmbDistrict` | `stateName` | 64 districts, value = name. Loaded on page load: `/ComboServlet` `objectId=136`, `funName=stateComboNOA` | a space |
| 5 | Procurement Method | `select#cmbProcurementMethod` | `procurementMethod` | same 16 methods as Flow 2 | empty |
| 6 | Framework Agreement | `select#cmbIsFrame` | `isFrame` | Yes `1`, No `2` | `0` |
| 7 | Contract No | text `#txtContractNo` | `contractNo` | free text | empty |
| 8 | Tender/Proposal ID | text `#txtTenderId` | `tenderId` | | empty |
| 9 | Tender/Proposal Ref. No | text `#txtTenderRefNo` | `tenderRefNo` | | empty |
| 10 | Value (In BDT) | text `#txtContractAmt` | `contractAmount` | a single value, no operator | empty |
| 11 | Keyword | text `#txtKWord` | `keyword` | | empty |
| 12 | Advertisement Date | text with calendar, `#advDt` | `advDt` | a **single date**. Typed `dd/mm/yyyy`, **sent `yyyy-mm-dd`** | empty |
| 13 | Date of Notification of Award | text with calendar, `#noaDt` | `noaDt` | a **single date**, same conversion | empty |
| 14 | Contract Award to | text `#txtContractAwardTo` | `contractAwardTo` | free text | empty |
| 15 | Contract Sign Date From / To | text with calendar, `#contractSigneDateFrom`, `#contractSigneDateTo` | `contractDtFrom`, `contractDtTo` | **the only date range**, sent as typed. Checked by `CompareContractSignDateFromTo()` | empty |
| 16 | Category | `#txtaCPV`, same CPV tree popup | `cpvCode` | | empty |

**Cascade:** Department → Procuring Entity only.

## C. Search and results

| Item | Finding |
|---|---|
| Search | `#btnSearch` → `loadTable(1)` → `POST /AdvSearchNOAServlet` with all the fields above plus `pageNo`, `size` (📖 from code). Fragment appended to `#resultTable` |
| Validation | Only the sign-date comparison. **Search runs with nothing set**, so the guard has to be ours |
| Reset | Reloads the page rather than clearing fields (`location.href`) |
| Page size | Hidden `#size` = 10, sent in the request. Size 100 **not yet tested on this servlet** |
| Pagination | Hidden `#totalPages`, "Page 1 of 89586", `#dispPage` + `#btnGoto` |
| Empty | `#noRecordFound` is checked in the code, same as Flows 2 and 3. Not yet seen |

### Result columns (`table#resultTable`)

| Col | Header | Parses into |
|---|---|---|
| 1 | S. No. | ignored |
| 2 | Ministry & Division | up to two levels, `<br>` separated |
| 3 | Tender/Proposal ID, Ref No., Title & Advertisement Date | ID, reference, title (detail link), date. The title may be cut short behind a "more" link, with the full text in `span.morecontent` |
| 4 | Procuring Entity, Procurement Method | office, method |
| 5 | District | |
| 6 | Date of Notification of Award | `dd-MMM-yyyy` |
| 7 | Contract Award to | a firm or person; personal data possible, the sanitiser must strip it |
| 8 | Value (Cr. BDT) / (Other Currency) | **Crore BDT**, e.g. `0.042`; other currencies possible |

**Natural key candidate:** `pkgLotId` from the detail link. Tender ID alone may repeat if one tender has several contracts. To check.

## D. Detail page

| Item | Finding |
|---|---|
| Link | Title in column 3: `/resources/common/ViewAwardedContracts.jsp?pkgLotId=<id>&tenderid=<id>`, `target="_blank"` |
| Buildable directly | **Yes**, a plain GET with both IDs from the row (📖) |
| Fields | Not yet captured |

## Open

- [ ] Owner's scope: which filters in the panel, which detail fields, which mandatory filters
- [ ] Search seen on the wire; `size=100` with matching totals
- [ ] Volume for a realistic selection
- [ ] Detail page fields
- [ ] Empty result
- [ ] Does a full sweep lose rows here too? Assumed yes (see `flow-2.md`)
