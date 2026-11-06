"""Demo output, one workbook per flow: 'About this grab' + 'Data'. Made-up data only."""
from datetime import date, datetime, timedelta
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter as L

OUT = Path(__file__).resolve().parent.parent / "docs" / "samples"
OUT.mkdir(parents=True, exist_ok=True)
F = "Arial"
FILL = {k: PatternFill("solid", fgColor=c) for k, c in dict(F="548235", L="1F3864", D="2E75B6", S="7F7F7F", H="1F3864", B="DDEBF7").items()}
thin = Side(style="thin", color="D9D9D9")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
DT, D, T, N, N3, CR = "dd-mmm-yyyy hh:mm", "dd-mmm-yyyy", "@", "#,##0", "#,##0.000", "0.000"
GRAB = datetime(2026, 11, 8, 10, 30)
fmt_of = {"dt": DT, "d": D, "t": T, "n": N, "n3": N3, "cr": CR, "pct": "0.000", None: None}

def font(**k): return Font(name=F, size=k.pop("size", 10), **k)

def build(fname, flow, what, login, filters, palette, cols, rows, checks, stats, notes):
    """cols: (group, header, type, width). rows: dict by header. stats: list of (title, header to group by, sum header or None)."""
    wb = Workbook()
    ab = wb.active; ab.title = "About this grab"
    ws = wb.create_sheet("Data")
    idx = {c[1]: i + 1 for i, c in enumerate(cols)}
    # ---- Data
    for i, (g, h, t, w) in enumerate(cols, 1):
        c = ws.cell(1, i, h); c.fill = FILL[g]; c.font = font(bold=True, color="FFFFFF"); c.border = BOX
        c.alignment = Alignment(wrap_text=True, horizontal="center", vertical="center")
        ws.column_dimensions[L(i)].width = w
    ws.row_dimensions[1].height = 62
    for r, row in enumerate(rows, 2):
        for i, (g, h, t, w) in enumerate(cols, 1):
            c = ws.cell(r, i, row.get(h)); c.font = font(); c.border = BOX; c.alignment = Alignment(vertical="top")
            if fmt_of[t]: c.number_format = fmt_of[t]
    last = len(rows) + 1
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{L(len(cols))}{last}"
    rng = lambda h: f"Data!${L(idx[h])}$2:${L(idx[h])}${last}"
    # ---- About
    ab.sheet_view.showGridLines = False
    for col, w in zip("ABCD", [34, 58, 16, 18]): ab.column_dimensions[col].width = w
    r = 1
    def title(t, size=11):
        nonlocal r
        c = ab.cell(r, 1, t); c.font = font(bold=True, size=size, color="FFFFFF"); ab.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)
        c.fill = FILL["H"]; r += 1
    def kv(k, v, f=None):
        nonlocal r
        a = ab.cell(r, 1, k); a.font = font(bold=True); a.fill = FILL["B"]; a.border = BOX; a.alignment = Alignment(vertical="top", wrap_text=True)
        b = ab.cell(r, 2, v); b.font = font(); b.border = BOX; b.alignment = Alignment(vertical="top", wrap_text=True, horizontal="left")
        if f: b.number_format = f
        r += 1
    title("DEMO: every value here is made up. Nothing came from the e-GP portal.", 10)
    title(flow, 14)
    r += 1
    title("What was done")
    ab.cell(r, 1, what).font = font(); ab.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4); ab.cell(r, 1).alignment = Alignment(wrap_text=True, vertical="top"); ab.row_dimensions[r].height = 44; r += 2
    title("The grab")
    kv("Portal", "e-GP Bangladesh, eprocure.gov.bd"); kv("Report page", flow)
    kv("Started", GRAB - timedelta(hours=1, minutes=18), DT); kv("Finished", GRAB, DT)
    kv("Time taken", "1 h 18 min"); kv("Login state", login)
    kv("Interruptions", "1 session expiry, resumed after login; 2 slow-downs. No data lost."); kv("Tool / rules version", "PDMS eGP Extractor 1.0.0 / site rules 1.0.0"); r += 1
    title("Filter conditions you set")
    for k, v in filters: kv(k, v)
    r += 1
    title("Notice-page fields you chose (checkerboard)")
    for k, v in palette: kv(k, v)
    r += 1
    title("Is it complete?")
    for k, v, f in checks: kv(k, v, f)
    r += 1
    title("Findings at a glance")
    kv("Rows in Data", f"=COUNTA({rng(cols[[c[0] for c in cols].index('L')][1])})", N)
    r += 1
    for t_, by, sm in stats:
        for i, h in enumerate([t_, "", "Rows", sm or ""]):
            c = ab.cell(r, 1 if i == 0 else i + 1, h)
            c.font = font(bold=True); c.fill = FILL["B"]; c.border = BOX
        ab.merge_cells(start_row=r, start_column=1, end_row=r, end_column=2); r += 1
        vals = sorted({x.get(by) for x in rows if x.get(by)}, key=lambda v: -sum(1 for x in rows if x.get(by) == v))
        for v in vals:
            ab.cell(r, 1, v).font = font(); ab.merge_cells(start_row=r, start_column=1, end_row=r, end_column=2); ab.cell(r, 1).border = BOX
            c = ab.cell(r, 3, f"=COUNTIF({rng(by)},A{r})"); c.font = font(); c.border = BOX
            if sm:
                c = ab.cell(r, 4, f"=SUMIF({rng(by)},A{r},{rng(sm)})"); c.font = font(); c.border = BOX; c.number_format = N3
            r += 1
        r += 1
    title("Good to know about this file")
    for n in notes:
        ab.cell(r, 1, n).font = font(); ab.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4); ab.cell(r, 1).alignment = Alignment(wrap_text=True, vertical="top"); ab.row_dimensions[r].height = 30; r += 1
    wb.calculation.fullCalcOnLoad = True
    wb.save(OUT / fname)
    print(fname, "rows", len(rows), "cols", len(cols))
    for t_, by, sm in stats:
        tally = {}
        for x in rows:
            k = x.get(by); tally.setdefault(k, [0, 0]); tally[k][0] += 1; tally[k][1] += (x.get(sm) or 0) if sm else 0
        print("  ", t_, {k: (v[0], round(v[1], 3)) for k, v in tally.items()})

def build2(cols, rows, fname, flow, what, login, filters, palette, checks, stats, notes):
    return build(fname, flow, what, login, filters, palette, cols, rows, checks, stats, notes)

SRC = [("S", "Page the row came from", None, 30), ("S", "Grabbed at", "dt", 17), ("S", "Login state", None, 12)]
def src(login, page): return {"Page the row came from": f"demo.invalid/{page}", "Grabbed at": GRAB, "Login state": login}
fcol = lambda names: [("F", "Filter: " + n, None, 16) for n in names]
COMMON = ["Every row has the filters you set in the green columns, so a row can be traced to its search even if files are merged.",
          "Headers: green = filter you set; dark blue = list table; light blue = the notice page that opens in a new tab, only those you ticked; grey = source.",
          "IDs are text, so leading zeros survive. Dates sort as dates. Amounts add up. A value the portal leaves blank or marks N.A. is empty."]

# ---- People and places, all fictional
MIN, ORG = "DEMO Ministry of Works", "DEMO Public Works Department"
PE1, PE2, PE3 = "DEMO PWD Division-1, Dhaka", "DEMO PWD Division-2, Khulna", "DEMO PWD Division-3, Sylhet"
FIRM1, FIRM2, FIRM3 = "DEMO Builders Ltd", "DEMO Traders", "DEMO Construction & Co"

# ---------------------------------------------------------------- Flow 2
fl2 = ["Department", "Procuring Entity", "Status", "Budget Type", "Procurement Nature", "Procurement Type", "Procurement Method", "Framework Agreement", "Tender/Proposal ID", "Reference No", "Publishing Date From", "Publishing Date To", "Closing Date From", "Closing Date To", "Category"]
fv2 = dict(zip(fl2, [ORG, "All", "All", "All", "All", "All", "All", "All", "-", "-", "01/01/2023", "31/12/2025", "-", "-", "All"]))
list2 = [("L", "Tender/Proposal ID", "t", 11), ("L", "Reference No", "t", 20), ("L", "Status", None, 15), ("L", "Procurement Nature", None, 11), ("L", "Title", None, 36), ("L", "Ministry", None, 22), ("L", "Division", None, 12), ("L", "Organization", None, 22), ("L", "Procuring Entity", None, 24), ("L", "Procurement Type", None, 10), ("L", "Procurement Method", None, 10), ("L", "Publishing Date and Time", "dt", 17), ("L", "Closing Date and Time", "dt", 17)]
det2 = [("App ID", "t"), ("Event Type", None), ("Invitation for", None), ("PE Code", "t"), ("PE District", None), ("Budget Type", None), ("Source of Funds", None), ("Project Code", "t"), ("Project Name", None), ("Package No.", "t"), ("Package Description", None), ("Category", None), ("Document Last Selling", "dt"), ("Pre-Tender Meeting Start", "dt"), ("Pre-Tender Meeting End", "dt"), ("Opening Date and Time", "dt"), ("Eligibility of Tenderer", None), ("Brief Description of Works", None), ("Evaluation Type", None), ("Document Available", None), ("Document Fees", None), ("Document Price (BDT)", "n"), ("Mode of Payment", None), ("Security Valid Up To", "d"), ("Tender Valid Up To", "d"), ("Lot No.", "t"), ("Identification of Lot", None), ("Location", None), ("Tender Security (BDT)", "n"), ("Tentative Start Date", "d"), ("Tentative Completion Date", "d"), ("Inviting Official Designation", None), ("Inviting Official City", None)]
cols2 = fcol(fl2) + list2 + [("D", h, t, 15) for h, t in det2] + SRC
rows2 = []
data2 = [("0900001", "Live", "Works", "DEMO repair of office building", PE1, "OTM", 2025, "Revenue", 500, 7000), ("0900002", "Contract Awarded", "Goods", "DEMO supply of office furniture", PE1, "OTM", 2024, "Development", 1000, 25000), ("0900003", "Being processed", "Works", "DEMO renovation of boundary wall", PE2, "OTM", 2025, "Revenue", 1000, 12000), ("0900004", "Contract Awarded", "Works", "DEMO road resurfacing", PE1, "OTM", 2023, "Development", 2000, 90000), ("0900005", "Cancelled", "Goods", "DEMO supply of generators", PE3, "OTM", 2024, "Development", 1500, 40000), ("0900006", "Contract Awarded", "Works", "DEMO hostel construction", PE2, "OTM", 2023, "Development", 5000, 300000), ("0900007", "Re-Tendered", "Works", "DEMO drainage repair", PE1, "OTM", 2025, "Revenue", 500, 9000), ("0900008", "Contract Awarded", "Service", "DEMO survey consultancy", PE3, "QCBS", 2024, "Development", None, None)]
for i, (tid, st, nat, ti, pe, me, y, bu, dp, se) in enumerate(data2, 1):
    p = datetime(y, 3 + i, 5, 10, 0); rev = me == "QCBS"
    rows2.append({**{"Filter: " + k: v for k, v in fv2.items()}, "Tender/Proposal ID": tid, "Reference No": f"DEMO/REF/{y}/{i}", "Status": st, "Procurement Nature": nat, "Title": ti, "Ministry": MIN, "Organization": ORG, "Procuring Entity": pe, "Procurement Type": "NCT", "Procurement Method": me, "Publishing Date and Time": p, "Closing Date and Time": p + timedelta(days=21),
        "App ID": f"22{6000 + i}", "Event Type": "REOI" if rev else "TENDER", "Invitation for": "Consulting firm" if rev else "Tender - Single Lot", "PE District": pe.split(", ")[-1], "Budget Type": bu, "Source of Funds": "Government" if bu == "Revenue" else "Aid or Grant", "Project Name": None if bu == "Revenue" else "DEMO Project", "Package No.": f"DEMO-PKG-{i}", "Package Description": ti, "Category": "DEMO Repair and maintenance", "Document Last Selling": p + timedelta(days=20), "Pre-Tender Meeting Start": p + timedelta(days=1), "Pre-Tender Meeting End": p + timedelta(days=3), "Opening Date and Time": p + timedelta(days=21), "Eligibility of Tenderer": "DEMO: 5 years of general experience", "Brief Description of Works": ti, "Evaluation Type": "Package wise" if rev else "Lot wise", "Document Available": "Package wise", "Document Fees": None if rev else "Package wise", "Document Price (BDT)": dp, "Mode of Payment": None if rev else "Payment through Bank", "Security Valid Up To": None if rev else (p + timedelta(days=110)).date(), "Tender Valid Up To": None if rev else (p + timedelta(days=80)).date(), "Lot No.": "1", "Identification of Lot": ti, "Location": pe.split(", ")[-1], "Tender Security (BDT)": se, "Tentative Start Date": (p + timedelta(days=60)).date(), "Tentative Completion Date": (p + timedelta(days=240)).date(), "Inviting Official Designation": "Executive Engineer", "Inviting Official City": pe.split(", ")[-1], **src("Logged out", "notice")})
build2(cols2, rows2, "Flow2_Tender_Info_demo.xlsx", "Tender Info", "Searched e-GP for tenders matching your filters, went through every result page, opened each tender's notice page, collected the fields you ticked, and joined them into one row per tender.", "Logged out: all departments are searchable. LTM tenders are NOT in this file, because the portal does not list them publicly. To include them, log in and run again.",
    [(k, v) for k, v in fv2.items() if v not in ("-",)], [("Ticked", "All 33 notice fields (Identity, Organisation, Procurement, Project, Dates, Terms, Lot, Official)"), ("Not ticked", "Inviting official's name and address")],
    [("Portal's total for this search", 8, N), ("Different tenders collected", f"=SUMPRODUCT(1/COUNTIF(Data!${L(cols2.index(list2[0]) + 1)}$2:${L(cols2.index(list2[0]) + 1)}$9,Data!${L(cols2.index(list2[0]) + 1)}$2:${L(cols2.index(list2[0]) + 1)}$9))", N), ("Notice pages opened / failed", "8 / 0", None), ("Verdict", "Complete", None)],
    [("Tenders by Procuring Entity", "Procuring Entity", "Tender Security (BDT)"), ("Tenders by Status", "Status", None), ("Tenders by Procurement Method", "Procurement Method", None)], COMMON + ["LTM tenders are absent from logged-out files on this page. Log in to include your own department's LTM tenders."])

# ---------------------------------------------------------------- Flow 4: PE and contractor analysis
fl4 = ["Department", "Procuring Entity", "Budget Type", "District", "Procurement Method", "Framework Agreement", "Contract No", "Tender/Proposal ID", "Ref. No", "Value (BDT)", "Keyword", "Advertisement Date", "Notification of Award", "Contract Award to", "Contract Sign Date From", "Contract Sign Date To"]
fv4 = dict(zip(fl4, [ORG, "All", "All", "All", "All", "All", "-", "-", "-", "-", "-", "-", "-", "-", "03/01/2021", "31/12/2025"]))
list4 = [("L", "Contract ID (pkgLotId)", "t", 11), ("L", "Tender/Proposal ID", "t", 11), ("L", "Ref No.", "t", 20), ("L", "Title", None, 34), ("L", "Advertisement Date", "d", 13), ("L", "Ministry & Division", None, 22), ("L", "Procuring Entity", None, 24), ("L", "Procurement Method", None, 10), ("L", "District", None, 11), ("L", "Date of Notification of Award", "d", 13), ("L", "Contract Award to", None, 24), ("L", "Value (Cr. BDT)", "cr", 10)]
det4 = [("Agency", None), ("PE Code", "t"), ("PE District", None), ("Contract Award for", None), ("Budget and Source of Funds", None), ("Development Partner", None), ("Project Code", "t"), ("Project Name", None), ("Package No.", "t"), ("Package Name", None), ("Date of Contract Signing", "d"), ("Expected Contract Completion", "d"), ("Contract Price", "n3"), ("Currency", None), ("Tenderer ID", "t"), ("Location of Delivery", None), ("Authorised Officer Designation", None),
        # Older layouts only (D31). "Proposed Date of Contract Completion" merges into Expected Contract Completion; "Name of Supplier" merges into Contract Award to.
        ("Older: Proposed Contract Start", "d"), ("Older: Tenders Sold", "n"), ("Older: Tenders Received", "n"), ("Older: Tenders Responsive", "n"), ("Older: Contract No", "t"), ("Older: Brief Description of Contract", None), ("Older: Location of Supplier", None), ("Older: Performance Security in Due Time", None), ("Older: Contract Signed in Due Time", None)]
cols4 = fcol(fl4) + list4 + [("D", h, t, 15) for h, t in det4] + SRC
data4 = [("1890001", "0900002", "DEMO supply of office furniture", PE1, "OTM", FIRM2, 948782.473, 2024, "1000002"), ("1890002", "0900004", "DEMO road resurfacing", PE1, "OTM", FIRM1, 12500000.000, 2023, "1000001"), ("1890003", "0900006", "DEMO hostel construction", PE2, "OTM", FIRM1, 45000000.500, 2023, "1000001"), ("1890004", "0900011", "DEMO roof repair", PE2, "OTM", FIRM3, 2200000.000, 2024, "1000003"), ("1890005", "0900012", "DEMO water line", PE3, "OTM", FIRM1, 3100000.250, 2025, "1000001"), ("1890006", "0900013", "DEMO supply of pumps", PE3, "RFQ", FIRM2, 420000.000, 2025, "1000002"), ("1890007", "0900014", "DEMO culvert repair", PE1, "OTM", FIRM3, 7600000.000, 2022, "1000003")]
rows4 = []
for i, (cid, tid, ti, pe, me, fi, pr, y, tr) in enumerate(data4, 1):
    a = date(y, 2 + i, 3)
    rows4.append({**{"Filter: " + k: v for k, v in fv4.items()}, "Contract ID (pkgLotId)": cid, "Tender/Proposal ID": tid, "Ref No.": f"DEMO/REF/{y}/{i}", "Title": ti, "Advertisement Date": a, "Ministry & Division": MIN, "Procuring Entity": pe, "Procurement Method": me, "District": pe.split(", ")[-1], "Date of Notification of Award": a + timedelta(days=30), "Contract Award to": fi, "Value (Cr. BDT)": round(pr / 1e7, 3), "Agency": ORG, "PE District": pe.split(", ")[-1], "Contract Award for": "Works", "Budget and Source of Funds": "Government", "Package No.": f"DEMO-PKG-{i}", "Package Name": ti, "Date of Contract Signing": a + timedelta(days=45), "Expected Contract Completion": a + timedelta(days=300), "Contract Price": pr, "Currency": "BDT", "Tenderer ID": tr, "Location of Delivery": pe.split(", ")[-1], "Authorised Officer Designation": "Executive Engineer", **src("Logged out", "contract")})
for i, r in enumerate(rows4):
    if i % 2:  # An older-layout contract: no Tenderer ID, and its own extra fields.
        r["Tenderer ID"] = None
        r.update({"Older: Proposed Contract Start": r["Date of Contract Signing"], "Older: Tenders Sold": 5, "Older: Tenders Received": 3, "Older: Tenders Responsive": 2, "Older: Contract No": f"DEMO-CON-{i}", "Older: Brief Description of Contract": r["Title"], "Older: Location of Supplier": "DEMO Road, Dhaka", "Older: Performance Security in Due Time": "Yes", "Older: Contract Signed in Due Time": "Yes"})
build2(cols4, rows4, "Flow4_Contract_Info_demo.xlsx", "Contract Info", "Searched e-GP for contracts matching your filters, went through every result page, opened each contract's detail page, collected the fields you ticked, and joined them into one row per contract.", "Logged out. This page shows the same results logged in or out.",
    [(k, v) for k, v in fv4.items() if v != "-"], [("Ticked", "All 26 contract fields, 10 of them only on older contract pages"), ("Not ticked", "Authorised officer's name; Beneficial Ownership (left out by your decision, D19)")],
    [("Portal's total for this search", 7, N), ("Different contracts collected", 7, N), ("Detail pages opened / failed", "7 / 0", None), ("Verdict", "Complete", None)],
    [("Contracts by Procuring Entity", "Procuring Entity", "Contract Price"), ("Contracts by contractor", "Contract Award to", "Contract Price")], COMMON + ["Value (Cr. BDT) is in Crore, from the list. Contract Price is in full units, from the detail page, with its currency beside it.", "The portal has several layouts of the contract page. Columns follow the latest one. Columns starting Older: are filled only for contracts on older pages, and Tenderer ID only for those on the latest page."])

# ---------------------------------------------------------------- Flow 5: contractor journey
fl5 = ["Department", "Procuring Entity", "Procurement Nature", "Procurement Method", "Procurement Type", "Work Status", "Tender Type", "Tender/Proposal ID", "Contract Start Date From", "Contract Start Date To", "Contract End Date From", "Contract End Date To", "Contract Awarded To", "Company Unique ID", "Experience Certificate No"]
fv5 = dict(zip(fl5, ["All", "All", "All", "All", "All", "All", "All", "-", "-", "-", "-", "-", "-", "1000001", "-"]))
list5 = [("L", "Experience Certificate No", "t", 22), ("L", "Record ID", "t", 9), ("L", "Ministry, Division", None, 22), ("L", "Organization", None, 22), ("L", "Procuring Entity", None, 24), ("L", "Procurement Nature", None, 11), ("L", "Procurement Type", None, 9), ("L", "Procurement Method", None, 9), ("L", "Tender/Proposal ID", "t", 11), ("L", "Ref No.", "t", 20), ("L", "Title", None, 32), ("L", "Publishing Date", "d", 13), ("L", "Contract Awarded To", None, 22), ("L", "Company Unique ID", "t", 10), ("L", "Contract Amount (BDT)", "n3", 15), ("L", "Contract Start Date", "d", 13), ("L", "Contract End Date", "d", 13), ("L", "Work Status", None, 10)]
det5 = [("Work Category", None), ("Name of Work", None), ("Tender Publication Date", "d"), ("Tender Type", None), ("Contract No.", "t"), ("Physical Progress (%)", "pct"), ("Financial Progress (%)", "pct"), ("Date of Physical Progress", "d"), ("Date of Financial Progress", "d"), ("Is JVCA", None), ("Remarks", None), ("Comments By PE", None)]
cols5 = fcol(fl5) + list5 + [("D", h, t, 14) for h, t in det5] + SRC
data5 = [(MIN, ORG, PE1, "Works", "OTM", "DEMO road resurfacing", 12500000.000, 2023, "Completed", 100), (MIN, ORG, PE2, "Works", "OTM", "DEMO hostel construction", 45000000.500, 2023, "Ongoing", 62), (MIN, ORG, PE3, "Works", "OTM", "DEMO water line", 3100000.250, 2025, "Ongoing", 15), ("DEMO Ministry of Health", "DEMO Health Directorate", "DEMO Hospital Unit, Rajshahi", "Works", "LTM", "DEMO ward renovation", 950000.000, 2022, "Completed", 100), ("DEMO Ministry of Education", "DEMO Education Directorate", "DEMO School Unit, Barishal", "Works", "OTM", "DEMO classroom block", 18000000.000, 2021, "Completed", 100), ("DEMO Ministry of Local Government", "DEMO Rural Engineering", "DEMO Upazila Office, Bogura", "Works", "OTM", "DEMO culvert", 2750000.000, 2024, "Completed", 100)]
rows5 = []
for i, (mi, og, pe, nat, me, ti, am, y, st, pg) in enumerate(data5, 1):
    s_ = date(y, 1 + i, 10); rows5.append({**{"Filter: " + k: v for k, v in fv5.items()}, "Experience Certificate No": f"DEMO-CERT-{y}-{i:03}", "Record ID": f"2600{i:02}", "Ministry, Division": mi, "Organization": og, "Procuring Entity": pe, "Procurement Nature": nat, "Procurement Type": "NCT", "Procurement Method": me, "Tender/Proposal ID": f"09100{i:02}", "Ref No.": f"DEMO/REF/{y}/{i}", "Title": ti, "Publishing Date": s_ - timedelta(days=60), "Contract Awarded To": FIRM1, "Company Unique ID": "1000001", "Contract Amount (BDT)": am, "Contract Start Date": s_, "Contract End Date": s_ + timedelta(days=300), "Work Status": st, "Work Category": "DEMO Civil works", "Name of Work": ti, "Tender Publication Date": s_ - timedelta(days=60), "Tender Type": "eTenders", "Contract No.": f"DEMO-CON-{i}", "Physical Progress (%)": pg, "Financial Progress (%)": max(pg - 5, 0), "Date of Physical Progress": date(2026, 10, 29), "Date of Financial Progress": date(2026, 10, 29), "Is JVCA": "No", **src("Logged out", "experience")})
build2(cols5, rows5, "Flow5_Experience_Info_demo.xlsx", "Experience Info: one contractor's journey", "Searched e-GP for every work experience record of one contractor, in every department and office, opened each record's detail page, collected the fields you ticked, and joined them into one row per record.", "Logged out. This page shows the same results logged in or out.",
    [(k, v) for k, v in fv5.items() if v != "-"] + [("Department and date window", "Not required: a contractor filter was used, and the result is under 5,000 rows (D21, D22)")], [("Ticked", "All 12 experience fields"), ("Not ticked", "PE Name, which holds a person's name")],
    [("Portal's total for this search", 6, N), ("Different records collected", 6, N), ("Detail pages opened / failed", "6 / 0", None), ("Verdict", "Complete", None)],
    [("Work by department", "Ministry, Division", "Contract Amount (BDT)"), ("Work by status", "Work Status", "Contract Amount (BDT)"), ("Work by Procuring Entity", "Procuring Entity", "Contract Amount (BDT)")], COMMON + ["A search by Contract Awarded To under Contains also matches similar names. Searching by Company Unique ID, as here, is exact."])

# ---------------------------------------------------------------- Flow 3
fl3 = ["Department", "Procuring Entity", "Financial Year", "Budget Type", "Project Name", "Procurement Nature", "Procurement Type", "APP ID", "Package No.", "Package Estimated Cost", "Category"]
fv3 = dict(zip(fl3, [ORG, "All", "2024-2025", "All", "All", "All", "All", "-", "-", "-", "All"]))
list3 = [("L", "APP ID", "t", 9), ("L", "Package ID", "t", 9), ("L", "Organization", None, 22), ("L", "Procuring Entity", None, 24), ("L", "District", None, 11), ("L", "Procurement Nature", None, 11), ("L", "Project Name", None, 18), ("L", "Package No", "t", 16), ("L", "Package Description", None, 34), ("L", "Estimated Cost (BDT)", "n", 14), ("L", "Procurement Method", None, 10)]
det3 = [("APP Code", "t"), ("Financial Year", "t"), ("Budget Type", None), ("Advance Procurement (APP)", None), ("Type of Emergency", None), ("Advance Procurement (Package)", None), ("Category", None), ("Approving Authority", None), ("PQ Requires", None), ("Procurement Type", None), ("Package Type", None), ("Source of Fund", None), ("Development Partners", None), ("Lot No.", "t"), ("Lot Description", None), ("Qty", "n"), ("Unit", None), ("Lot Estimated Cost (BDT)", "n"), ("Expected Advertisement", "d"), ("Expected Submission", "d"), ("Expected Opening", "d"), ("Expected Evaluation Report", "d"), ("Expected Approval of Award", "d"), ("Expected Issuance of NOA", "d"), ("Expected Contract Signing", "d"), ("Expected Contract Completion", "d"), ("Total Days to Contract Signing", "n")]
cols3 = fcol(fl3) + list3 + [("D", h, t, 14) for h, t in det3] + SRC
data3 = [("226001", "700001", PE1, "Works", "DEMO-PKG-29", "DEMO renovation of hospital ward", 4500000, "OTM"), ("226001", "700002", PE1, "Goods", "DEMO-PKG-30", "DEMO repair of water pump", 350000, "RFQ"), ("226001", "700003", PE1, "Works", "DEMO-PKG-31", "DEMO painting of office", 900000, "LTM"), ("226077", "700004", PE2, "Works", "DEMO-PKG-11", "DEMO office block", 25000000, "OTM"), ("226077", "700005", PE2, "Service", "DEMO-PKG-12", "DEMO design consultancy", 1200000, "QCBS"), ("226090", "700006", PE3, "Goods", "DEMO-PKG-07", "DEMO supply of computers", 2100000, "OTM")]
rows3 = []
for i, (ap, pk, pe, nat, no, de, co, me) in enumerate(data3, 1):
    a = date(2024, 9, 1) + timedelta(days=i * 20)
    rows3.append({**{"Filter: " + k: v for k, v in fv3.items()}, "APP ID": ap, "Package ID": pk, "Organization": ORG, "Procuring Entity": pe, "District": pe.split(", ")[-1], "Procurement Nature": nat, "Package No": no, "Package Description": de, "Estimated Cost (BDT)": co, "Procurement Method": me, "APP Code": f"DEMO-{ap}", "Financial Year": "2024-2025", "Budget Type": "Revenue", "Advance Procurement (APP)": "No", "Advance Procurement (Package)": "No", "Category": "DEMO Civil works", "Approving Authority": "Executive Engineer", "PQ Requires": "No", "Procurement Type": "NCT", "Package Type": "Package", "Source of Fund": "Government", "Lot No.": "1", "Lot Description": de, "Qty": 1, "Unit": "Lot", "Lot Estimated Cost (BDT)": co, "Expected Advertisement": a, "Expected Submission": a + timedelta(days=21), "Expected Opening": a + timedelta(days=21), "Expected Evaluation Report": a + timedelta(days=35), "Expected Approval of Award": a + timedelta(days=45), "Expected Issuance of NOA": a + timedelta(days=50), "Expected Contract Signing": a + timedelta(days=75), "Expected Contract Completion": a + timedelta(days=300), "Total Days to Contract Signing": 75, **src("Logged out", "package")})
build2(cols3, rows3, "Flow3_APP_Info_demo.xlsx", "APP Info", "Searched e-GP's Annual Procurement Plans for your filters, went through every result page, opened each package's detail page, collected the fields you ticked, and joined them into one row per package.", "Logged out. This page shows the same results logged in or out.",
    [(k, v) for k, v in fv3.items() if v != "-"], [("Ticked", "All 27 package fields"), ("Not ticked", "The detail page's Procuring Entity field, which holds a person's name (D17)")],
    [("Portal's total for this search", 6, N), ("Different packages collected", 6, N), ("Detail pages opened / failed", "6 / 0", None), ("Verdict", "Complete", None)],
    [("Packages by Procuring Entity", "Procuring Entity", "Estimated Cost (BDT)"), ("Packages by method", "Procurement Method", "Estimated Cost (BDT)")], COMMON + ["One APP has many packages, so APP ID repeats. Package ID identifies a row."])

# ---------------------------------------------------------------- Flow 1
fl1 = ["Financial Year", "PE Office"]
m = lambda s: [("L", f"{s} National", "n", 11), ("L", f"{s} International", "n", 11)]
c3 = lambda s: [("L", f"{s} National", "cr", 11), ("L", f"{s} International", "cr", 11)]
list1 = [("L", "Office", None, 26), ("L", "Budget Type", None, 12), ("L", "Row Type", None, 13), ("L", "Method", None, 9), ("L", "Procurement Nature", None, 10)] + m("Packages Planned") + c3("Planned Amount (Cr. BDT)") + m("Tenders Live") + m("Tenders Being Evaluated") + m("Packages Awarded") + c3("Contracted Amount (Cr. BDT)") + c3("Progress by Packages (%)") + c3("Progress by Amount (%)")
cols1 = fcol(fl1) + list1 + SRC
def r1(of, bu, kind, me, nat, pl, pa, li, ev, aw, ca):
    pc = lambda a, b: round(a / b * 100, 3) if b else None
    return {"Filter: Financial Year": "2024-2025", "Filter: PE Office": "All", "Office": of, "Budget Type": bu, "Row Type": kind, "Method": me, "Procurement Nature": nat, "Packages Planned National": pl, "Packages Planned International": 0, "Planned Amount (Cr. BDT) National": pa, "Tenders Live National": li, "Tenders Live International": 0, "Tenders Being Evaluated National": ev, "Tenders Being Evaluated International": 0, "Packages Awarded National": aw, "Packages Awarded International": 0, "Contracted Amount (Cr. BDT) National": ca, "Progress by Packages (%) National": pc(aw, pl), "Progress by Amount (%) National": pc(ca, pa), **src("Logged in", "report")}
rows1 = [r1(PE1, "Development", "Method", "OTM", "Goods", 4, 0.5, 0, 0, 4, 0.3), r1(PE1, "Development", "Method", "OTM", "Works", 6, 9.0, 0, 1, 4, 7.0), r1(PE1, "Development", "Budget Total", None, None, 10, 9.5, 0, 1, 8, 7.3), r1(PE1, "Revenue", "Method", "LTM", "Works", 100, 9.5, 1, 2, 90, 8.2), r1(PE1, "Revenue", "Budget Total", None, None, 100, 9.5, 1, 2, 90, 8.2), r1(PE1, "Own Fund", "Budget Total", None, None, 0, 0.0, 0, 0, 0, 0.0), r1(PE1, "All", "Grand Total", None, None, 110, 19.0, 1, 3, 98, 15.5), r1(PE2, "Development", "Budget Total", None, None, 0, 0.0, 0, 0, 0, 0.0), r1(PE2, "Revenue", "Budget Total", None, None, 0, 0.0, 0, 0, 0, 0.0), r1(PE2, "Own Fund", "Budget Total", None, None, 0, 0.0, 0, 0, 0, 0.0), r1(PE2, "All", "Grand Total", None, None, 0, 0.0, 0, 0, 0, 0.0)]
build2(cols1, rows1, "Flow1_Procurement_Transaction_demo.xlsx", "Procurement Transaction Report", "Generated the report for your financial year, once for each office, and collected every row of its three budget tables into one flat table.", "Logged in: this report needs a login, and it covers your own department.",
    [("Financial Year", "2024-2025"), ("PE Office", "All: 2 offices in this demo, one report each"), ("Quarter, Programme, Project, Budget Type", "Left as the page has them, by your decision")], [("Notice-page fields", "None: this report has no detail page")],
    [("Offices in the list / reports collected", "2 / 2", None), ("Method rows add up to each budget total", "Yes, all", None), ("Budget totals add up to the grand total", "Yes, all", None), ("Verdict", "Complete", None)],
    [("Rows by office", "Office", None), ("Rows by type", "Row Type", None)], COMMON + ["Total rows are kept and marked in Row Type. Filter Row Type to Method before adding up, or totals count twice.", "An office with all zeros had nothing to report that year."])
