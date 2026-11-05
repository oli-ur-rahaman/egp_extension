# Recon R4 — Flow 3: APP Info (Annual Procurement Plan)

**Session:** R4, 2026-11-05 · **Driver:** owner, **logged out** (D11) · **Observer:** Claude over CDP
**Status:** [~] the list mechanism is fully captured, read from the page's own code in one snapshot. Left: the package detail page, both cascades confirmed live, an empty result, and the owner's scope decisions.

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

**The Flow 1 vocabulary trap repeats here.** `param1` is not the dropdown value: Development becomes `Aid or Grant`, Revenue becomes `Government`, Own fund stays `Own fund`, and nothing selected sends an empty string. `startDate` is the year's **text** (`2025-2026`), not its value.

## C. Search and results

| Item | Finding |
|---|---|
| Search | `input#btnSearch` → `POST /SearchServlet` with `action=Search`; the response is an **HTML fragment** of rows, appended to `#resultTable` |
| **Fast path** | Yes, the same shape as Flow 2: a known POST, an HTML fragment back, no clicking |
| POST body | `action, departmentId, office, project, financialYear, budgetType, procNature, procType, appId, appCode, pkgNo, operation, value, value2, pageNo, size, cpvCat` (plus `userId`, empty when logged out) |
| Pagination | `loadTable()` re-posts the **same** body with a new `pageNo`, so page 1 and page N are one code path. Hidden `#totalPages`; the label reads "Page 1 of 17391"; buttons first/prev/next/last, plus `#dispPage` with `#btnGoto` |
| Page size | hidden `#size` = 10, with **no control on the page**. Whether the servlet honours a larger `size` is untested and worth one try: it would cut the request count directly |
| Validation | `chkappID()` numeric APP ID; `chkdigits1/2()` decimals; `Between` requires both values in the right order |
| Empty result | expected to be the Flow 2 shape (`#noRecordFound`, pagination hidden); **to confirm** |
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

## D. Detail page

| Item | Finding |
|---|---|
| Link | in column 6, on the package description |
| URL | `ViewPackageDetail.jsp?appId=<appId>&pkgId=<pkgId>&pkgType=Package&from=home` |
| **Buildable directly** | **Yes** — both ids come from the list row, so the detail needs no click and no popup juggling |
| Opens in | a new tab (`target="_blank"`). The extension builds the URL itself and never needs that tab |
| Fields | **not yet read** |

**The list is already package-level, so Flow 3 has no one-to-many flattening problem.** One APP ID appears on several rows, one per package (observed: three rows sharing one APP ID). The natural key is therefore the pair (`appId`, `pkgId`), both available in the link — for the owner to confirm (Q6).

## E. Volume

| Selection | `totalPages` at size 10 | Rows |
|---|---|---|
| No filter at all, as the page loads | **17,391** | ≈ 174,000 |

At about 3 s per request that is roughly 15 hours for the list alone, before any detail pages. Flow 2's answer was a mandatory department plus a 5-year date window (D13), but **this page has no date filter at all** — the nearest equivalent is Financial Year, which is one year, not a range. A guard for this flow has to be built from Department plus Financial Year.

## Open

- [x] Filters, cascades, search contract, pagination, result columns and the detail route, all from `p3.1-app-initial`
- [ ] Owner's scope decisions: which filters the panel shows, which detail fields matter, what keeps a run a sensible size
- [ ] Department → Procuring Entity cascade confirmed live, and `totalPages` for a realistic selection
- [ ] Financial Year + Budget Type → Project cascade confirmed live
- [ ] `ViewPackageDetail.jsp` fields, and whether a package detail holds its own one-to-many tables
- [ ] Empty result shape
- [ ] Does the servlet honour a `size` larger than 10?
