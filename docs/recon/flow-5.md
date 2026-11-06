# Recon R6 — Flow 5: Experience Info (eExperience)

**Session:** R6, 2026-11-05 · **Driver:** owner, **logged out** (D11) · **Observer:** Claude over CDP
**Status:** [x] R6 done, logged out. Filters, Search, size 100, detail page, empty result, window check and owner's scope are captured. Full-sweep loss is assumed from Flow 2, not tested here. A logged-in comparison follows (R7).

## Client requirement (owner, 2026-11-05)

**D20. Flow 5 scope.** All filters in the panel. **Department and a Contract Start Date window of at most 5 years are mandatory**, unless D21 applies. The palette starts empty (owner, on Claude's recommendation). **Tender Type is a dropdown in the panel, default All** (owner), though the page defaults to eTenders.

**D21. Contractor exemption, for every flow that has such a filter.** If the user enters anything in a filter that pinpoints a contractor, the Department and date requirements don't apply, because one contractor has few results.

| Flow | Filters that lift the requirement |
|---|---|
| 4 Contract Info | Contract Award to |
| 5 Experience Info | Contract Awarded To, Company Unique ID. Experience Certificate No is **not** a contractor filter (owner): the number is unique and gives one result; how it is treated is in Open |
| 1, 2, 3 | none: no contractor filter on these pages |

**Tested (recording `r6-experience-contractor`, Tender Type All, Contains, 2026-11-05).** With no filter at all: 18,735 pages.

| Entered in Contract Awarded To | Pages | Rows (about) | Holds up? |
|---|---|---|---|
| A firm's full name | 1–3 | up to 30 | yes |
| Name + Company Unique ID | 2 | up to 20 | yes |
| A person's first name (`jamal`) | 39 | 390 | yes |
| `Construction` | 1,922 | 19,200 | **no** |
| `a` | 15,491 | 155,000 | **no**, 83% of everything |

So the owner's reasoning holds for a contractor and fails for a broad word, because the page's default match is Contains. **Agreed with the owner (D22):** the exemption applies only while the entry's real result stays at or under **5,000 rows** (the contract's stated scale, D5). Above that, Department and date are required again, with a message saying why. The panel already reads the size from page 1, so this needs no guessing, and no minimum-length rule, which would fail on `ltd`. These searches take 2–6 s each, slower than most.

## A. Identity

| Item | Finding |
|---|---|
| Route | Homepage search dropdown → eExperience → Advanced Search |
| URL | `/resources/common/SearcheCMS.jsp?v=advSearch`, title "eExperience" |
| Results on load | Yes. Hidden `#totalPages` = **15,931** at size 10 (≈ 159,000), Tender Type eTenders only. **Tender Type All: 18,735 pages (≈ 187,000)** |
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
| Page | Title "eExperience Work's Status Details". Four `table.formStyle_1` label/value blocks, located by label text |

### Field palette (from the experience detail)

| Group | Fields |
|---|---|
| Certificate | Work Experience Certificate No |
| Organisation | Ministry/Division, Organization Name, PE Office Name, PE Name (holds a person's name; **out of the palette**, as D17) |
| Tender | Tender ID, Tender Ref No, Package No, Package Name, Procurement Nature, Procurement Method, Work Category, Name of Work, Work Completion Status, Tender Publication Date, Tender Type |
| Contract | Contract Start Date, Contract End Date, Contract No., Contract Value (Equivalent in BDT) |
| Progress | Physical Progress (%), Financial Progress (%), Date of Physical Progress, Date of Financial Progress |
| Company | Company Name, Is JVCA |
| Comments | Remarks, Comments By PE |

The status is in the URL (`wcs=ongoing` or `wcs=completed`), so the link needs the row's work status as well as its `Id`. A completed record shows the **same 28 labels** as an ongoing one (2026-11-06).

## Open

- [x] D21 tested: holds for real names and IDs, not broad words. Size limit proposed above
- [x] Search on the wire: 150–400 ms when no text match is involved, 2–6 s with one
- [x] **Size 100:** 8,377 rows at both sizes (size 10: 838 pages, 7 on last; size 100: 84 pages, 77 on last)
- [x] **Volume:** PWD, Tender Type All, no window = 1,578 pages ≈ 15,800. With contract start 03/01/2021 onward = 838 pages. The To date stayed at 31/12/2030 in that test, so this isn't a true 5-year window, but it is an upper bound for one starting then
- [x] **Window hides nothing visible:** no window and 02/01/2000–31/12/2030 both give 1,578 pages (PWD)
- [x] Detail page fields; palette
- [x] Empty: `#noRecordFound` "No Record Found!", with `totalPages` = 1
- [ ] Sample a completed record's detail page
- [x] Owner: Tender Type default All; palette starts empty
- [x] Owner agreed the 5,000-row limit (D22)
- [ ] Owner: Experience Certificate No needs no Department or date, like Tender ID? Taken as agreed with D22 unless corrected; it has the same size limit
