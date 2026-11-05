# Recon R5 — Flow 4: Contract Info (eContracts)

**Session:** R5, 2026-11-05 · **Driver:** owner, **logged out** (D11) · **Observer:** Claude over CDP
**Status:** [~] in progress. Filters, Search on the wire, detail page and owner's scope are captured. Left: size 100 check, empty result, how many contracts the date window excludes.

## Client requirement (owner, 2026-11-05)

**D19. Flow 4 scope.** All **16 filters** in the panel. **Department and a date window of at most 5 years are mandatory.** The window uses Contract Sign Date From/To, the only date range this page has. The field palette starts empty. Measured: PWD, sign dates 03/01/2021–31/12/2025 = **7,119 pages ≈ 71,200 contracts**, down from 89,586 pages. At size 100 and about 3 s per request, that's about 36 minutes for the list and about 59 hours with every detail page.

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
| Search | `#btnSearch` → `loadTable(1)` → `POST /AdvSearchNOAServlet` with all the fields above plus `pageNo`, `size`. Confirmed on the wire: about 1 s, about 7 KB, fragment appended to `#resultTable`. Dates keep their `dd/mm/yyyy` form URL-encoded; Procuring Entity and District placeholders are sent as a single space. `cpvCode` is absent when Category is untouched |
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
| Page | Title "Contract Awards Details". Six `table.formStyle_1` label/value blocks, plus `table.viewShareholdersTable`. Located by label text |
| Login state | **No login form on this page**, so its absence doesn't mean logged in. Detail pages can't show login state; check it on the list page |

### Field palette (from the contract detail)

| Group | Fields |
|---|---|
| Organisation | Ministry/Division, Agency, Procuring Entity Name, Code, District |
| Identity | Contract Award for, Tender/Proposal ID, Invitation/Proposal Ref. No. |
| Procurement | Procurement Method (National/International), Budget and Source of Funds, Development Partner |
| Project and package | Project/Program Code, Project/Program Name, Package No., Package Name |
| Dates | Date of Advertisement, Notification of Award, Contract Signing, Expected Contract Completion. No date range on Completion |
| Contract | **Contract Price**, Name of the Economic Operator, Tenderer ID of the Economic Operator |
| Beneficial ownership (one-to-many) | No., Name, Designation, Ownership %, Country. Holds personal names; can have several rows. **Owner to decide** |
| Authorised officer | Name, Designation. Personal data; the sanitiser must strip it |

**Units differ within this flow:** the list shows Crore BDT, the detail shows full BDT with the currency in brackets (e.g. `948782.473 (BDT)`). The parser splits amount from currency.

## Open

- [x] Owner's scope (D19)
- [x] Search seen on the wire; volume for a realistic selection; detail page fields
- [ ] `size=100` with matching totals
- [ ] How many PWD contracts have no sign date in any window, which the mandatory window would hide
- [ ] Beneficial ownership in the palette?
- [ ] Empty result
- [ ] Does a full sweep lose rows here too? Assumed yes (see `flow-2.md`)
