# Recon R6 — Flow 5: Experience Info (eExperience)

**Session:** R6, 2026-11-05 · **Driver:** owner, **logged out** (D11) · **Observer:** Claude over CDP
**Status:** [~] in progress. Everything below comes from one snapshot and the page's own JavaScript, plus the owner's scope. Not yet seen on the wire: Search, size, detail page, empty result, volume with filters.

## Client requirement (owner, 2026-11-05)

**D20. Flow 5 scope.** All filters in the panel. **Department and a Contract Start Date window of at most 5 years are mandatory**, unless D21 applies. The palette starts empty (carried over from Flows 3 and 4; to confirm).

**D21. Contractor exemption, for every flow that has such a filter.** If the user enters anything in a filter that pinpoints a contractor, the Department and date requirements don't apply, because one contractor has few results.

| Flow | Filters that lift the requirement |
|---|---|
| 4 Contract Info | Contract Award to |
| 5 Experience Info | Contract Awarded To, Company Unique ID, Experience Certificate No (Claude's reading of "etc"; to confirm) |
| 1, 2, 3 | none: no contractor filter on these pages |

**Being tested:** "anything" also covers a very broad entry such as one letter, under a Contains match. See Open.

## A. Identity

| Item | Finding |
|---|---|
| Route | Homepage search dropdown → eExperience → Advanced Search |
| URL | `/resources/common/SearcheCMS.jsp?v=advSearch`, title "eExperience" |
| Results on load | Yes. Hidden `#totalPages` = **15,931** at size 10 (≈ 159,000), Tender Type eTenders only |
| Logged-out signature | The login form is on this page too |

## B. Filters

| # | Label | Control | Request field | Values | Blank |
|---|---|---|---|---|---|
| 1 | Select Ministry/Division/Organization | read-only `#txtdepartment` + hidden `#txtdepartmentid`, tree popup | `departmentId` | any tree node | empty |
| 2 | Procuring Entity | `select#cmbOffice` | `officeId` | **depends on 1**, via `/ComboServlet` | `0` |
| 3 | Procurement Nature | `select#cmbProcurementNature` | `procurementNature` | Goods, Works, Service, Physical Services (value = text) | empty |
| 4 | Procurement Method | `select#cmbProcurementMethod` | `procurementMethod` | **depends on 3, client-side with no request**: `loadProcurementMethod()` writes the list; value = short code (OTM, LTM…) | empty |
| 5 | Procurement Type | `select#procType` | `procType` | NCT, ICT | empty |
| 6 | Work Status | `select#cmbWorkStatus` | `workStatus` | All, Completed, Ongoing | default **All** |
| 7 | Tender Type | `select#packageType` → `changeTab()` sets hidden `#statusTab` | `statusTab` | eTenders `1`, eCMS `2`, Manual `3` (sent as `OffLine`), All `4` | default **eTenders** |
| 8 | Tender/Proposal ID | text `#txtTenderId` | `tenderId` | | empty |
| 9 | Contract Start Date From / To | text `#contractStartDtFrom`, `#contractStartDtTo` | `contractStartDtFrom`, `contractStartDtTo` | typed `dd/mm/yyyy`, **sent `yyyy-mm-dd`** | empty |
| 10 | Contract End Date From / To | text `#contractEndDtFrom`, `#contractEndDtTo` | `contractEndDtFrom`, `contractEndDtTo` | same conversion | empty |
| 11 | Contract Awarded To | `select#contAwrdSearchOpt` + text `#txtContractAwardTo` | `contAwrdSearchOpt`, `contractAwardTo` | **Contains** (default) or Equals | empty |
| 12 | Company Unique ID | text `#txtTendererId` | `tendererId` | numeric | empty |
| 13 | Experience Certificate No | `select#exCertSearchOpt` + text `#exCertificateNo` | `exCertSearchOpt`, `exCertificateNo` | Contains (default) or Equals | empty |

**Cascades:** Department → Procuring Entity (request); Procurement Nature → Method (no request).

**New control type:** a match-mode dropdown paired with a text box (filters 11, 13).

**Open for the owner:** Tender Type defaults to eTenders, so a run would miss eCMS and Manual unless changed. On Flow 2 the owner set Status to default All.

## C. Search and results

| Item | Finding |
|---|---|
| Search | `#btnSearch` → `btnSearchClick()` → `POST /AdvSearcheCMSServlet`, `action=geteCMSList`, all filters plus `pageNo`, `size` (📖 from code) |
| **Page-size trap** | `btnSearchClick()` **forces `#size` back to 10 before searching**. The Console-and-Search test used on the other flows would prove nothing here; set the size after Search, then page. The extension sends its own request, so this only affects testing |
| Stray fields | The code also sends `keyword`, `expCertNo`, `contractAmount` from elements that **aren't on this page**, so those fields go out empty or absent |
| Reset | Reloads the page |
| Validation | None that blocks Search. `validateNumericInput()` strips non-digits from a numeric input |

### Result columns (`table#resultTable`)

| Col | Header | Parses into |
|---|---|---|
| 1 | S. No. | ignored |
| 2 | Ministry, Division, Organization, PE | three levels in the sample, `<br>` separated |
| 3 | Procurement Nature, Type & Method | nature, type, method |
| 4 | Tender/Proposal ID, Ref No., Title & Publishing Date | three parts; title carries the detail link |
| 5 | Contract Awarded To | firm or person; personal data possible, sanitiser must strip it |
| 6 | Company Unique ID | numeric |
| 7 | Experience Certificate No | |
| 8 | Contract Amount (In BDT / Equivalent in BDT) | **full BDT**, e.g. `186400.000` |
| 9 | Contract Start & End Date | two `dd-MMM-yyyy` dates |
| 10 | Work Status | |

**Natural key candidate:** Experience Certificate No, or `Id` from the detail link. To check.

## D. Detail page

| Item | Finding |
|---|---|
| Link | Title in column 4: `/resources/common/VieweCmsDetails.jsp?wcs=<status>&Id=<id>`, `target="_blank"` |
| Buildable directly | Probably, a plain GET using the row's `Id` and work status (📖) |
| Fields | Not yet captured |

## Open

- [ ] D21 tested: how many results do broad and narrow contractor entries give?
- [ ] Search on the wire; size 100 with matching totals (use the trap note above)
- [ ] Volume: PWD + 5-year Contract Start Date window
- [ ] Detail page fields; palette
- [ ] Empty result
- [ ] Owner: Tender Type default; Experience Certificate No as a D21 filter; palette starts empty
