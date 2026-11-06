# Recon R8 — What changes the format of the new-tab pages?

**Asked by the owner, 2026-11-06:** the detail pages opened from Flows 2–5 aren't uniform. Which filter options and row attributes change their format, on all four flows? The checkerboard (D25) and the template (D31) depend on the answer. The owner handed this study to Claude to run alone.
**Status:** [x] done, logged out and logged in. Results below.

## Ground rules

- **Read only.** Search requests and page views, the same ones a visitor makes by hand. Nothing is submitted, saved or changed on the portal.
- **Logged out**, in the debug Chrome's own tab. Claude does not log in and never opens the credentials file. So this study can't see logged-in-only tenders, including LTM on Flow 2.
- **One request at a time, about 3 s apart** with random variation. At most **900 requests** in a run.
- **Stops by itself** on a CAPTCHA or block page, a login or error page, 3 failures in a row, or responses slower than 20 s. No retrying past those.
- **Stores labels, not values.** Each sampled page is reduced to its list of field labels plus the row's filter attributes. No contractor or official names are kept. Raw results stay in the git-ignored `recon/raw/`; only summaries reach this public repo.

## Method

For each flow, every factor is sampled:

1. **One factor at a time:** for each value of each filter, one list request on page 1 and one on a middle page, so results span newest and older records.
2. **Crosses that may matter:** Nature × Method; on Flow 5, Tender Type × Work Status.
3. **Up to 4 rows per request** are opened, skipping records already seen.
4. Each detail page is reduced to a **layout fingerprint:** its ordered set of visible labels. Hidden rows are noted apart.
5. **Analysis:** for every factor value, which fingerprints occur, and how strongly. A factor changes the format only if its values separate the layouts. Row attributes (status, year, method, nature) are tested as well as filters.

## Factors

| Flow | Page opened | Factors |
|---|---|---|
| 2 Tender Info | Notice | Status (Live, Archive, Cancelled, All) · Nature (4) · Method (16) · Type (NCT, ICT) · Budget Type (3) · Framework (Yes, No) · publication year · Nature × Method |
| 3 APP Info | Package detail | Financial Year · Nature (4) · Type (2) · Budget Type (3) · package type in the link |
| 4 Contract Info | Contract detail | Method (16) · Budget Type (3) · Framework (2) · contract sign year |
| 5 Experience Info | Experience detail | Tender Type (4) × Work Status (3) · Nature (4) · Method · Type (2) · contract start year |

Not filters, so tested as row attributes: event type (TENDER, REOI, PQ, RFP, PPS), record status, and how old the record is.

Not sampled as factors: Department and Procuring Entity. They would multiply the requests, and a format change by department is unlikely. Checked indirectly: a sampled department is recorded with each row where the list shows it.

## Results (2026-11-06, logged out)

**Sampled:** 675 detail pages from 169 filter values, using 1,029 requests over 4 runs (`self-run-log.md`). No CAPTCHA or block. One slow search stopped a run, as designed.

**Limits of this evidence:** samples, not a census, so a rare layout can be missed. Thin spots: Flow 3 Services (1 page), Flow 2 RFP (4) and Physical Services (8). Logged-out only. Department and Procuring Entity weren't tested as factors.

### What changes the format

| Flow | Changes it | Doesn't |
|---|---|---|
| **2 Notice** | **Procurement Nature**, and for Services the **notice kind** (REOI, RFP, RFA), which is not a filter. **Status** changes a little. **Amendments** add a block on any tender | Type, Budget, year, method within a Nature |
| **3 Package** | **Procurement Nature**, and **Method** for the RFQ family | Financial Year, Budget, Type |
| **4 Contract** | **The contract's date**: the change happened around Oct–Dec 2025 | Method, Budget, Framework |
| **5 Experience** | **Contract date**, the same change, adding one table; Manual records didn't show it | **Work Status**, Nature, Method, Type |

### Flow 2 notice

- **Goods and Works share one layout,** differing in one label: "Brief Description of Goods and Related Service" against "Brief Description of Works" (60/61 and 120/120).
- **Services** (34 pages) use different labels: Eligibility of Consultant, Brief Description of assignment, Experience Resources and delivery capacity, Association with foreign firm, Contract Type, Package No. and Description, Ref. No., Phasing of service, Indicative dates. No lots table, document price or tender security. Their kinds differ again (REOI 17, RFA 13, RFP 4): only 17 of 34 have Closing and Opening dates; 13 of 34 name an inviting official; 11 of 34 have Valid Up to.
- **Physical Services** (8) are PPS notices: PPS No., PPS for selection of, PPS Publication, PPS Document Price, PPS Security Amount, plus consultant-style labels.
- **Status:** Cancelled drops Security Valid Up to and Tender Valid Up to (0/10). **Being processed** drops the status row on 15 of 25.
- **Amendments:** a block (Amendment / Corrigendum No., Text, Field Name, Old Value, New Value), numbered, and possibly repeated. Rare overall, more common on older tenders. It explains most of the 65 label sets.
- Status values beyond the tabs: Re-Tendered, Rejected, "Amendment/Corrigendum issued : 1".

### Flow 3 package

34 labels are on every page. **Works** adds PQ Requires. **Goods and Works** have the Lot table. **Physical Services and Services** have Service Type, "REOI / RFA / RFP / PPS Requires", and Package No. **The date block has variants:** Tender/Proposal Dates; **RFQ Dates** for RFQ, RFQU and RFQL (11/11); REOI and RFP dates for Services, with 11 different date labels on the one sample. APP Code is often present, but less so on RFQ (2 of 9). Financial Year, Budget Type and Type didn't separate layouts.

### Flow 4 contract

| Signed | Sampled | Layout |
|---|---|---|
| 2011 to Sep 2025 | all 0 of 8 per quarter in 2025 Q1–Q3 | **Old:** Contract No, Tenders Sold, Received, Responsive, Supplier name and location, Performance Security, Signed in Due Time |
| Oct–Dec 2025 | 3–4 of 8 | **Mixed** |
| 2026 | 4 of 4 by sign date; 91 of 91 by award date | **New:** Economic Operator, Tenderer ID, Business Address, Beneficial Ownership |

Within the new layout, the completion date is labelled either "Expected" or "Proposed", about half each, at every method. Treat them as one field. The change looks like a portal update on a date, with a mixed period; the exact rule isn't known.

### Flow 5 experience

**Uniform:** 28 labels on every page, including completed and ongoing. **Work Status explains 4% of the variety, so it doesn't change the format.** The only real change is the Beneficial Ownership table on contracts starting from late 2025 (2026: 17 of 18; 2025: 3 of 13). Manual records (11 pages) never showed it.

### Other findings

- **Logged-out Flow 2 lists only 7 of 16 methods.** Pages at size 20: OTM 30,928, OSTETM 1,008, IC 18, QCBS 13, SFB 2, LCS 1, SBCQ 1. **RFQ, LTM, TSTM, DC, SSS, CSO, DPM, RFQU, RFQL return nothing.** Not only LTM.
- **Flow 4 shows contracts for all 16 methods, logged out:** OTM 22,913, LTM 19,677, RFQU 800, OSTETM 724, RFQ 572, RFQL 62, DPM 44 pages, and a few others. **Flow 5 likewise:** LTM 4,140 pages, more than OTM. So hidden methods are hidden at the tender stage, and they surface once awarded. For the contractor journey, this makes Flows 4 and 5 the complete sources.
- **Flow 2's Framework Agreement filter returned nothing for Yes and for No.** The same filter works on Flow 4 (Yes 161, No 44,642 pages). This looks like a portal fault.
- **Searching Flow 5 with Tender Type All can be very slow:** one search took 54 s. A sweep should expect this and not read it as a block.
- **Flow 3 has only Package in its link type** across all samples, so that value isn't a factor.

### Design consequence: the checkerboard

The fields shouldn't be a list of page labels: there would be about 100 on Flow 2 alone. **One tick per cluster (D32, below),** and the Site Profile maps every label variant to its field. So "Closing Date" reads Tender/Proposal Closing, EOI Closing or plain Closing. A tick that doesn't apply to a record leaves that cell empty, with no error. Fields that exist only for some records say so beside the tick: "Services only". A label the tool has never seen doesn't stop the run and doesn't go missing: it's listed in the About sheet.

**The filters already tell the panel what to expect:** if the user picks Nature = Works on Flow 2, it can hide Services-only ticks.

### Decided: the checkerboard is 5–6 clusters (D32)

**One tick per cluster, not per field** (owner, 2026-11-06). Opening a page is what costs time, whether 1 field or 100 are read, so fine-grained ticks would save nothing. Each cluster reads all its label variants. A field that doesn't apply to a record stays empty. An unknown label is listed on the About sheet.

| Flow | Cluster 1 | Cluster 2 | Cluster 3 | Cluster 4 | Cluster 5 | Cluster 6 |
|---|---|---|---|---|---|---|
| **2 Notice** | **Identity:** App ID, Event Type, Invitation for, Reference/REOI/RFA/PPS No., Amendments | **Organisation:** Ministry, Division, Organization, PE Name, Code, District | **Procurement and funding:** Nature, Type, Method, Contract Type, Budget, Source of Funds, Development Partner, Project, Package, Category | **Dates:** publication, document selling, pre-tender meeting, closing, opening, security, validity | **Terms and money:** eligibility, brief description, experience, foreign firm, evaluation type, document and payment terms, prices, security | **Lot or service, and official:** lot or phasing of service, location, start and completion, inviting official's designation and address |
| **3 Package** | **Identity:** APP ID, APP Code, Financial Year, Advance Procurement | **Organisation:** Ministry, Division, Organization, PE Office and Code, District | **Procurement and funding:** Nature, Type, Method, Budget, Source of Fund, Partners, Project, Approving Authority, Emergency, PQ, Service Type | **Package:** Package No., Description, Estimated Cost, Category, Package Type | **Lot:** Lot No., Description, Qty, Unit, Estimated Cost | **Planned dates:** Tender, RFQ, REOI and RFP date blocks, Total Time to Signing |
| **4 Contract** | **Identity:** Award for, Tender ID, Ref. No., Package No. and Name, Contract No, Brief Description | **Organisation:** Ministry, Agency, PE Name, Code, District | **Procurement and funding:** Method, Budget and Source, Partner, Project | **Dates:** advertisement, award, signing, proposed start, completion | **Contract and contractor:** Price, Currency, Operator or Supplier name, Tenderer ID, addresses, delivery location | **Competition and compliance:** tenders Sold, Received, Responsive; Security and Signing in due time; Authorised Officer's designation |
| **5 Experience** | **Certificate and tender:** Certificate No, Tender ID, Ref No, Publication, Tender Type | **Organisation:** Ministry, Organization, PE Office | **Work:** Package, Nature, Method, Category, Name of Work | **Contract:** Contract No, Start, End, Value | **Progress:** Status, Physical and Financial Progress, and their dates | **Company and comments:** Company Name, Is JVCA, Remarks, Comments By PE |

Left out of every cluster, as already decided: people's names in the PE Name fields (D17), and Beneficial Ownership (D19). Officials' names stay out unless the owner asks.

Flow 1 has no detail page, so no checkerboard.

## Results, logged in (2026-11-06, PWD account, Department 21)

**Sampled:** all 169 filter values, 560 detail pages. Same filters and pace as logged out. Two network failures during power cuts stopped it safely; it resumed each time, and the session survived.

**Login doesn't change a page's fields: it changes which records you can reach.** The same record seen both ways had identical labels (10 of 10: Flow 2 3, Flow 3 2, Flow 4 5).

| Flow | Finding |
|---|---|
| **2** | Login reveals methods hidden from the public, for PWD, in pages at size 20: **LTM 5,022, RFQU 465, RFQ 43, RFQL 8, DPM 2**. OTM is 3,373. TSTM, DC, SSS and CSO are 0, but PWD may simply have none, so this doesn't say whether login reveals them |
| **3, 4, 5** | No new kinds of field except rare ones below. Earlier same-search counts matched (`r7-logged-in-audit.md`) |

**New layouts, seen only because the login reached them:**

- **RFQ notices** (34 pages; RFQ, RFQU, RFQL): RFQ No., RFQ Publication, and plain Closing, Opening and Document labels. A fifth notice kind.
- **Framework notices** (Goods (Framework Agreement), LTM): a **List of PE Offices for Framework Contract** table (Office Name, PE Name, Designation, Lead Office). On Flows 2 and 3.
- **Flow 5 JVCA records** (1 page): Role In JVCA, Lead Partner Share (%), Amount.
- Not seen logged in only because PWD has few of them: REOI and RFP. Those labels are logged-out-only for that reason, **not** because of login.

**Other findings:**

- **On Flow 2 logged in, the Budget Type filter appears to do nothing:** Development, Revenue and Own Fund all give 8,913 pages, the unfiltered total. Logged out it works (12,897, 15,911, 3,160). The tool sends it the same way. Warn in the panel.
- **A logged-out notice can be refused:** one cancelled tender returned only "This tender is not exists or You are un-authorized to access information". So that's a normal per-row outcome, and must not stop a run.
- Framework Agreement returns 0 for Yes and No logged in too, though framework tenders exist. So that filter is broken on Flow 2 either way.

**Not done:** the logged-out re-run for PWD. It would only sharpen page counts, and the same-search audit already showed Flow 2's gap and the others' equality. Skipped to save the portal about 1,000 requests.

## Not yet known

- Whether login reveals TSTM, DC, SSS and CSO.
