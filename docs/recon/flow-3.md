# Recon R4 — Flow 3: APP Info (Annual Procurement Plan)

**Session:** R4, 2026-11-05 · **Driver:** owner, **logged out** (D11) · **Observer:** Claude over CDP
**Status:** [x] R4 done. List mechanism, both cascades, the package detail page, an empty result and the owner's scope are all captured. One optional experiment is left: whether the servlet honours a page `size` larger than 10.

## Client requirement (owner, 2026-11-05)

**D15. Flow 3 scope.** All **11 filters** appear in the panel; this page is well designed, so nothing is hidden. **Department and Financial Year are both mandatory** before a run may start — the owner's judgement that this is guard enough, on a page that has no date filter at all. Measured, that is 1,841 pages ≈ 18,400 packages for PWD in one year: about 1.5 h for the list sweep, and about 15 h if every package detail is fetched. The **field palette therefore starts with nothing ticked**, so the expensive detail pass is always a deliberate choice.

**D16. One row per package; lots are always single** (owner, 2026-11-05). e-GP has no multi-lot packages, so the Lot Details table is always one row and its fields (Lot No., Description, Qty, Unit, Estimated Cost) are plain columns. This extends D14 from Flow 2 to Flow 3, and the same safeguard applies: if a package ever returns more than one lot, the extension **flags the row in the reconciliation report** instead of silently keeping the first.

**D17. Procuring Entity.** The panel reads the entity list per department, which the `/ComboServlet` cascade makes straightforward (confirmed live: 224 offices for PWD). The **detail page's** field of the same name holds a *person's* name, not an office; it stays **out of the palette by default** and is only collected if the owner asks for it explicitly. The office name is already in list column 3, so nothing is lost.

## A. Identity

| Item | Finding |
|---|---|
| Route | Homepage search dropdown → **Annual Procurement Plans** → Advanced Search |
| URL | `/resources/common/AdvAPPSearch.jsp`, title "Advanced Search for Annual Procurement Plan" |
| Direct GET | Yes, no session needed |
| Tab selector | `select#cmbSearchTab` switches between eTenders `1`, Annual Procurement Plans `2`, eContracts `3`, eExperience `4`. **The same control sits on all four pages**, so one profile entry covers the shell of Flows 2–5 |
| Logged-out signature | The login form is on this page too, as on Flow 2 |
| Results on load | **Yes.** The first page is already rendered, with hidden `#totalPages` = **17,391** at `size` 10 (≈174,000 packages) |

## B. Filters

| # | Label | Control | Request field | Values | Blank |
|---|---|---|---|---|---|
| 1 | Select Ministry/Division/Organization | read-only `#txtdepartment` + hidden `#txtdepartmentid`, from the **same tree popup** as Flow 2 (`DeptTree.jsp?operation=homeallTenders`) | `departmentId` | any tree node | empty |
| 2 | Procuring Entity | `select#cmbOffice` | `office` | **depends on 1**; only the placeholder `0` until a department is chosen | `0` |
| 3 | Financial Year | `select#cmbYear` | `financialYear` | 18 years, `2010-2011` … `2027-2028`, placeholder is a single space. **The current year is preselected**, not the placeholder | space |
| 4 | Budget Type | `select#cmbBudget` | `budgetType` | Development `1`, Revenue `2`, Own fund `3` | empty |
| 5 | Project Name | `select#cmbProject` | `project` | **3,351 options preloaded**; replaced by the cascade below | space |
| 6 | Procurement Nature | `select#cmbNature` | `procNature` | Goods, Works, Service, Physical Services (value = the text) | empty |
| 7 | Procurement Type | `select#cmbType` | `procType` | NCT, ICT | empty |
| 8 | APP ID | text `#txtAppId` | `appId` | numeric, checked by `chkappID()` | empty |
| 9 | Package No. | text `#txtPkgNo` | `pkgNo` | free text | empty |
| 10 | **Package Estimated Cost** | `select#cmbOperator` + text `#txtVal1` + `#txtVal2` | `operation`, `value`, `value2` | operator `=`, `<=`, `>=`, `Between`; the values are decimals | empty |
| 11 | Category | **`textarea#txtaCPV`** (name `cpvCat`), from the same `CPVTree.jsp` popup as Flow 2 | `cpvCat` | semicolon-separated category **names** | empty |
| — | hidden | `#viewType` = `Live`, `#pageNo`, `#size` = 10 | | | |

**A new control type for the project: a numeric comparison.** Filter 10 is the first operator-plus-value filter we have met. `Between` needs both values and enforces value2 greater than value1; the other operators use `value` alone. This is the M3-T06 case, written in the plan as "date-range and text filters, if recon finds them".

**No filter is mandatory.** `chkMinistry()` reads as though it required Procurement Nature and Budget Type, but both checks are **commented out** in the live page. All it really does is validate the `Between` range. So, unlike Flow 2, Search runs with everything blank and returns all 17,391 pages. **The volume guard has to be ours.**

### Cascades

```
Department ──(POST /ComboServlet)──────────────────────────────► Procuring Entity
Financial Year ─┐
Budget Type ────┴──(POST /APPServlet  funName=getAppProjectAdv)─► Project Name
```

`cleartemp()` posts to `/APPServlet` with `param1` = a budget word, `param4` = `getAppProject`, `startDate` = the financial-year text, `funName` = `getAppProjectAdv`, and replaces the Project options with the HTML it gets back.

**Confirmed on the wire (recording `r4-app-pwd-search`, 2026-11-05):**

| Request | Body | Response |
|---|---|---|
| `POST /ComboServlet` | `departmentId=21&funName=officeCombo` | `<option>` list, 224 offices + placeholder, ≈12.5 KB |
| `POST /APPServlet` | `param1=&param4=getAppProject&startDate=2024-2025&funName=getAppProjectAdv` | `<option>` list of projects, very large (≈200 KB) |
| `POST /SearchServlet` | `action=Search&departmentId=21&office=+&project=&financialYear=2024-2025&budgetType=&procNature=&procType=&appId=&pkgNo=&operation=&value=&value2=&pageNo=1&size=10&cpvCat=` | rows fragment + `totalPages` |

Two details the code alone did not show: the Procuring Entity placeholder is sent as a **single space**, not `0`; and **`userId` is simply absent when logged out**, because the field does not exist on the page, so the servlet tolerates its absence.

**The Flow 1 vocabulary trap repeats here.** `param1` is not the dropdown value: Development becomes `Aid or Grant`, Revenue becomes `Government`, Own fund stays `Own fund`, and nothing selected sends an empty string. `startDate` is the year's **text** (`2025-2026`), not its value.

## C. Search and results

| Item | Finding |
|---|---|
| Search | `input#btnSearch` → `POST /SearchServlet` with `action=Search`; the response is an **HTML fragment** of rows, appended to `#resultTable` |
| **Fast path** | Yes, the same shape as Flow 2: a known POST, an HTML fragment back, no clicking |
| POST body | `action, departmentId, office, project, financialYear, budgetType, procNature, procType, appId, appCode, pkgNo, operation, value, value2, pageNo, size, cpvCat` (plus `userId`, empty when logged out) |
| Pagination | `loadTable()` re-posts the **same** body with a new `pageNo`, so page 1 and page N are one code path. Hidden `#totalPages`; the label reads "Page 1 of 17391"; buttons first/prev/next/last, plus `#dispPage` with `#btnGoto` |
| Page size | hidden `#size` = 10, with **no control on the page**. The servlet **does** honour a larger `size` (see Open), which cuts list requests directly. Detail pages are still one request per row |
| Validation | `chkappID()` numeric APP ID; `chkdigits1/2()` decimals; `Between` requires both values in the right order |
| Empty result | **captured.** `<td id="noRecordFound" value="noRecordFound" colspan="7">No Records Found</td>`, and `#pagination` is set to `display: none`. **Trap: `#totalPages` is left stale** at the page-load value (17,391) and the label still reads "Page 1 of 17391", so an empty result must be detected by `#noRecordFound`, never by the page count |
| **`totalPages` arrives in the fragment** | the response contains `<input id="totalPages" value="1841">`, so the sweep reads the page count **from the response**, not from the host page. The page's own script copies it into the DOM; the extension does not need to |
| Response size | ≈ 8.3 KB for a page of 10 rows |
| Other actions | `action=WatchList` exists on the same servlet. It is a logged-in feature and out of scope |

### Result columns (`table#resultTable`)

Seven columns, and **four of them pack two values into one cell, separated by a line break**:

| Col | Header | Parses into |
|---|---|---|
| 1 | S. No. | ignored: it is only the position on the page |
| 2 | APP ID | `app_id` |
| 3 | Ministry, Division, Organization, PE | `organization` + `procuring_entity` |
| 4 | District | `district` |
| 5 | Procurement Nature, Project Name | `procurement_nature` + `project_name` (often blank) |
| 6 | Package No, Description | `package_no` + `package_description`; the description carries the detail link |
| 7 | Estimated Cost (in BDT), Procurement Method | `estimated_cost` + `procurement_method` |

Splitting those cells is part of the parser, not an afterthought: the two halves are different fields. Costs arrive as plain decimals, not Crore, so there is no unit conversion here — unlike Flow 1.

## D. Detail page — `ViewPackageDetail.jsp`

| Item | Finding |
|---|---|
| Link | in column 6, on the package description |
| URL | `ViewPackageDetail.jsp?appId=<appId>&pkgId=<pkgId>&pkgType=Package&from=home` |
| **Buildable directly** | **Yes** — both ids come from the list row, so the detail needs no click and no popup juggling |
| Opens in | a new tab (`target="_blank"`). The extension builds the URL itself and never needs that tab |
| Title | "View APP Package Details :" |
| Structure | a 5-row header block, then four labelled sections. Fields are label/value table rows, located by label text, as on the Flow 2 notice |
| Export | a "Save As PDF" link; not needed |

### Field palette (from the package detail)

**Header block:** Ministry · Division · Organization · PE Office and Code · Budget Type · Project Name.

**Key Fields Information:** APP ID · APP Code · Financial Year · Budget Type · Advance Procurement (APP) · Project Name · **Procuring Entity** · District.

**Package Details:** Procurement Nature · Type of Emergency · Advance Procurement (Package) · Package No · Package Description · Package Estimated Cost (In BDT) · **Category** · Approving Authority · PQ Requires · Procurement Method · Procurement Type · Package Type · Source of Fund · Development Partners.

**Lot Details:** a table — Lot No. · Lot Description · Qty · Unit · Estimated Cost (In BDT).

**Tender/Proposal Dates:** eight dates, all `dd-MMM-yyyy` (e.g. `01-Jun-2026`) — Expected Date of Advertisement of Tender/Proposal on e-GP website · of submission of Tender/Proposal · of Opening of Tender/Proposal · of Submission of Evaluation Report · of Approval for Award of Contract · of Issuance of the NOA · of Signing of Contract · of Completion of Contract. Then **Total Time to Contract Signing**, a plain number of days.

So the palette for Flow 3 is about **35 fields plus the lot table**, a little smaller than Flow 2's notice.

### Three things that matter for the build

1. **`Procuring Entity` on this page is a person's name, not an office.** The list column of the same name holds the office. This is personal data: it must never be echoed into a commit, the sanitiser (M1-T07) must strip it, and the palette should mark it so the owner chooses it deliberately.
2. **Lot Details is a real one-to-many table**, unlike Flow 2 where multi-lot tenders do not exist (D14). The sample package has one lot, labelled `Single`, so single-lot packages are expressed as a one-row table rather than as empty lot fields. A flattening rule is needed (see Open).
3. **`Category` on the detail repeats the CPV name list** — 1,110 characters in the sample, the same shape as the `cpvCat` filter value. It is worth keeping as one cell, not split, for the reason given in the Flow 2 notes: names can themselves contain a semicolon.

**Date format differs from the list and from Flow 2:** `dd-MMM-yyyy` here, against `dd/mm/yyyy` in the Flow 2 filters. The profile carries the format per flow; the parser never guesses.

## E. Volume

| Selection | `totalPages` at size 10 | Rows |
|---|---|---|
| No filter at all, as the page loads | **17,391** | ≈ 174,000 |
| PWD + Financial Year 2024-2025 (measured 2026-11-05) | **1,841** | ≈ 18,400 |

At about 3 s per request that is roughly 15 hours for the list alone, before any detail pages. Flow 2's answer was a mandatory department plus a 5-year date window (D13), but **this page has no date filter at all** — the nearest equivalent is Financial Year, which is one year, not a range. A guard for this flow has to be built from Department plus Financial Year.

**Measured: Department + Financial Year is still a long run.** PWD with FY 2024-2025 is 1,841 pages, so about 1.5 h for the list alone at a polite pace, and about 15 h if the palette asks for all 18,400 package pages. The list sweep is acceptable and resumable; the detail pass is what costs. Hence the recommendation that **the field palette starts with nothing ticked**, so a careless run is 1.5 h rather than 15.

## Open

- [x] Filters, cascades, search contract, pagination, result columns and the detail route, all from `p3.1-app-initial`
- [x] Owner's scope decisions: see "Client requirement" below
- [x] Department → Procuring Entity cascade confirmed live: the tree writes `departmentId` = 21 and Procuring Entity goes from 1 option to **225**
- [x] Financial Year alone repopulates Project (3,351 → **3,015** options), so the cascade fires on the year as well as on Budget Type
- [x] `totalPages` for a realistic selection: PWD + FY 2024-2025 = **1,841 pages**
- [x] `ViewPackageDetail.jsp` fields: ~35 in four sections, plus a **Lot Details** table (one-to-many) and eight `dd-MMM-yyyy` dates
- [x] Multi-lot flattening: not needed — e-GP has no multi-lot packages (D16)
- [~] `Procuring Entity` (a person's name) on the detail: **off by default** until the owner says otherwise (D17)
- [x] Empty result shape: `#noRecordFound`, pagination hidden, `totalPages` left stale
- [~] **The servlet honours `size` above 10.** PWD + FY 2025-2026 with `size=50`: 50 rows, `totalPages` 412, about 42 KB, 583 ms (recording `r4b-size-experiment`, 2026-11-05). Still to check: the largest size it allows, and that no rows are lost or repeated at a larger size.
- [ ] **Natural key (Q6):** APP ID is **not** unique. The same 50 rows hold only 16 distinct APP IDs, so one APP has many packages. The key must be `pkgId`, from the detail link, or APP ID + Package No.
