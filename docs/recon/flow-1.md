# Recon R2 — Flow 1: Procurement Transaction Report

**Session:** R2, 2026-11-04 · **Driver:** owner (logged in, PWD officer account) · **Observer:** Claude over CDP
**Status:** [x] R2 done for recon purposes. The client requirement is captured, and a non-empty result is captured. The fixture commit waits for the sanitiser (M1-T07).

## Key decision from this session

**D11. Flows 2–5 run logged out; Flow 1 runs logged in.** The owner confirmed that the public pages (homepage → search dropdown → Advanced Search) offer a department selector only when logged out. Logged in, they are restricted to PWD. The Procurement Transaction Report is only available logged in. Consequences:

- The Sentinel's `LOGIN_WALL` handling applies to **Flow 1 only**. For Flows 2–5, a logged-in page is the wrong state: the extension must tell the user to log out or use a logged-out window.
- Flows 2–5 recon (R3–R6) is done logged out.

## A. Identity

| Item | Finding |
|---|---|
| Menu path | Reports → Procurement Transaction Report |
| URL | `/report/ProcTransReport.jsp` (page title "Procurement Transaction Report (Nature Wise)") |
| Direct GET | Works while logged in (the page loads from its URL) |
| Department | **Fixed by the login.** Hidden `depId=21`, `depName=Public Works Department (PWD)`; not selectable |
| Page tech | JSP, jQuery 1.4.3, inline handlers |

## B. Filters

| # | Label | Control | `name` | Options | Placeholder / "no filter" value | Change handler |
|---|---|---|---|---|---|---|
| 1 | By Financial Year * | `select#cmbFinancialYear` | `financialyear` | 18 years, `2010-2011` … `2027-2028` | `0` "Please Select Financial Year". **Mandatory** (client-side `validate()`) | `changeQuater()`: rebuilds Quarter **client-side**, no request |
| 2 | By Quarter | `select#quater` | `quater` (+ hidden `quatername` = option text) | 10: All Four Quarter, Q1–Q4, Q1+Q2, Q2+Q3, Q3+Q4, Q1+Q2+Q3, Q2+Q3+Q4 | none ("All Four Quarter" is the default) | `setQuaterName()` |
| 3 | PE Office | `select#cmboffice` | `offId` (+ hidden `offName`) | 224 PWD offices | **none**: the first office is preselected; there is no "all offices" option | `setOffName()` only (no request) |
| 4 | By Programme | `select#program` | `program` (+ hidden `programname`) | 3,691 | `0` "Please Select Programme" | `onSelectionOfProject()`: XHR, replaces Project options |
| 5 | By Project | `select#project` | `project` (+ hidden `projectname`) | 11,615 initially | `0` "Please Select Project" | `setProjectName()` |
| 6 | Budget Type | `select#cmbBudType` | `cmbBudType` (+ hidden `budgetType` = option text) | Development `1`, Revenue `2`, Own Fund `3` | `0` "--Select Budget Type--" | `getProject()`: XHR, replaces Project options |

**Quarter values are date ranges** built from the year: `Q1` of 2024-2025 = `2024-07-1_2024-09-30`, All Four Quarter = `2024-07-1_2025-06-30`. Before a year is chosen they contain `undefined`.

**Portal bugs to code around:**
1. The option "Q2 and Q3 and Q4" is written `<option value'…'>`, a typo, so its submitted value is the text `Q2 and Q3 and Q4`, not a date range. Don't offer it, or send its correct range ourselves.
2. `getProject()` maps Budget Type to a different vocabulary before the XHR: Development → `Aid or Grant`, Revenue → `Government`, Own Fund → `Own fund`, none → `All`. The submitted form still carries `cmbBudType=1` and `budgetType=Development`.
3. Changing PE Office doesn't refresh Project, although `getProject()` filters Project by office. The Project list can therefore be stale for the office shown.

### Dependency graph

```
Financial Year ──(client-side)──► Quarter
PE Office ─┐
Budget Type ┴──(XHR getProject)──► Project
Programme ─────(XHR getProjectFrmPrograme)──► Project
```

Project has two parents, and the last one changed wins. Programme isn't filtered by office (all 3,691 are always listed).

## C. Search and results

| Item | Finding |
|---|---|
| Search | **Generate** = `input#generate` (submit) → full-page **form POST** to `/report/ProcTransReport.jsp`, `application/x-www-form-urlencoded`, ~290 ms |
| POST body | `financialyear, quater, quatername, depName, depId, offId, offName, program, programname, project, projectname, cmbBudType, budgetType, generate=Generate` |
| **Fast path** | Yes. A plain form POST with known fields, and the response is server-rendered HTML. The engine can send the POST directly and parse the HTML, with no clicking (Q1 answered: postback, not JSON) |
| Criteria echo | The results page prints "Search Criteria : By Financial Year : …, By Quarter : …, PE Office : …" above the table. This is useful as provenance and as a check that the server applied our filters |
| Results table | `table#tab1.tableList_3` |
| Pagination | **None.** It's an aggregate report: one row per procurement method plus a Total row |
| Export links | "Print"; "Save As PDF" → `/TorRptServlet?…&action=PTRpt&…` (not needed) |

### Results table layout (Nature Wise)

Three header rows, then a row of column numbers 1–18, then data rows.

| Col | Header (group → sub) |
|---|---|
| 1 | Sr. No |
| 2 | Method of Procurement |
| 3 / 4 | Total Contract Package/Lot planned as per Proc. Plan (No.) → National / International |
| 5 / 6 | Total planned amount as per Proc. Plan (Crore BDT) → National / International |
| 7 / 8 | Total Tender on Live → National / International |
| 9 / 10 | Total Tender on Being Evaluated → National / International |
| 11 / 12 | Total Contract Package/Lot awarded/contract signed (No.) → National / International |
| 13 / 14 | Total Contracted amount (Crore BDT) → National / International |
| 15 / 16 | Progress as against planned No. of package/Lot (%) → National (Col 11/3)*100 / International (Col 12/4)*100 |
| 17 / 18 | Progress as against planned amount (%) → National (Col 13/5)*100 / International (Col 14/6)*100 |

The last row is the Total, e.g. "Total Development Budget" (spans cols 1–2). Amounts have 3 decimals (Crore BDT). Counts are integers.

**Implications for the design**
- The Excel row = one method row × one filter combination, with the filter values as provenance columns. Flat headers are built by joining the groups, e.g. `planned_packages_national`.
- There is no "of N" total to reconcile against. The **reconciliation oracle is the Total row**: the sum of the method rows must equal the Total row, column by column.
- Columns 15–18 are derived. Store them as given and also check them against their formulas.

## D. Detail pages

Not applicable (Pattern A).

## E. States captured

| Page ID | State | Captured |
|---|---|---|
| P-1.1 | Initial load, filters at defaults | [x] |
| P-1.2 | Cascade: Budget Type → Project, Programme → Project (network) | [x] |
| P-1.3 | Validation: Generate with no year | [x] from code: client-side `validate()` adds `div.err` "Please select Financial Year". No request is sent |
| P-1.4 | Results | [x] non-empty: FY 2024-2025, Chattogram PWD Division-1, other filters left as the page defaults. Development 2 methods, Revenue 3 methods, Own Fund empty, Grand Total |
| P-1.6 | Empty | [x] **Empty is not "no rows"**: the table renders with only the Total row, all zeros. Treat all-zero as `EMPTY` |
| P-1.7 | Search request | [x] see C |

## Client requirement (owner, 2026-11-04) — supersedes the generic "mirror every filter"

The page is poorly designed: choosing a Programme or Project often returns nothing. The client's need is narrow. **The extension panel shows only Financial Year and PE Office.** It never changes the page's other filters; they stay as the page has them.

| Filter | In the extension panel | Sent to the portal |
|---|---|---|
| Financial Year | **User picks one** (required) | the chosen year |
| PE Office | **User picks one office, or "All"** | one office; on "All", **loop through every office** (224 today, read live from the dropdown) |
| Quarter | not shown, not touched | page default: All Four Quarter, the first option once a year is chosen |
| Programme | not shown, not touched | page default `0` |
| Project | not shown, not touched | page default `0` |
| Budget Type | not shown, not touched | page default `0`: verified, returns **all three budget types** in one response (see below) |

- A sprint is one year × N offices, so on "All" it makes 224 requests. There's no cascade to walk: PE Office doesn't depend on anything here.
- Excel: one row per **office × budget type × procurement method**. Each budget's Total row and the GRAND TOTAL are kept as their own rows, flagged `row_kind = method | budget_total | grand_total`. Provenance: `financial_year`, `office_id`, `office_name`, `budget_type`.
- An office whose tables are all zeros is recorded as `EMPTY`, not as an error.
- Estimate: 224 × (≈0.3 s server + polite delay) ≈ 10–20 min per full run.

This simplifies M3/M4 for Flow 1: the panel mirrors two filters, and the planner is a single-level loop. The generic engine stays, because Flows 2–5 may still cascade.

## Results with Budget Type unselected (the client's configuration)

The response holds **three tables**, one per budget type, each with the same 18-column layout:

| Table | Caption (text before it) | Total row label |
|---|---|---|
| `table#tab1` | Development Budget | `Total Development Budget` |
| `table#tab2` | Revenue Budget | `Total Revenue Budget` |
| `table#tab3` | Own Fund | `Total Own Fund`, then a blank row, then **`GRAND TOTAL`** |

An empty budget type has only its Total row, all zeros (Own Fund in the sample).

**Cells**
- Data cells carry ids `t{table}col{col}_{row}`, e.g. `t1col11_1` = table 1, column 11, method row 1. Total cells are `t{table}total{col}`.
- **Columns 15–18 (progress %) are computed in the browser.** The cell holds `<label id="t1lab1_1">` plus an inline `<script>` that fills it. In the raw server HTML (the fast path) the label may be empty, so the parser **computes cols 15–18 itself** from the documented formulas, and checks them against the page when they're present.
- `N.A.` means not applicable (a division by zero, or no international value). It's exported as **empty**, never 0 (PROJECT_PLAN §7.4).
- Total rows sometimes format counts with decimals (`7.000`, `133.000`). Coerce them to integers.
- The method label contains the category: `OTM(Goods)`, `OTM(Works)`, `LTM(Works)`, `RFQU(Works)`. Split it into `method` + `procurement_nature`.

**Reconciliation (the correctness oracle, checked by hand on the sample)**
1. For each budget type: the sum of the method rows = its Total row, for columns 3–14. Development 4+4 = 8 ✓; Revenue 106+45+1 = 152 ✓.
2. The three budget Total rows sum to GRAND TOTAL: 8+152+0 = 160 ✓; amounts 9.297+18.957+0 = 28.254 ✓.
3. Percentages match their formulas: 140/160 = 87.5 % ✓; 23.327/28.254 = 82.562 % ✓.

**Criteria echo:** "By Quarter :" printed blank, because the hidden `quatername` is only set when the user touches Quarter. That's cosmetic; the submitted range is the full year.

## Open

- [x] Budget Type `0` (no selection) returns all budget types (Development, Revenue, Own Fund + GRAND TOTAL).
- [x] Non-empty results captured (raw, home PC). [ ] Commit it as a sanitised fixture once M1-T07 exists.
