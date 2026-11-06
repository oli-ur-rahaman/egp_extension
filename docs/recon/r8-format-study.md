# Recon R8 — What changes the format of the new-tab pages?

**Asked by the owner, 2026-11-06:** the detail pages opened from Flows 2–5 aren't uniform. Which filter options and row attributes change their format, on all four flows? The checkerboard (D25) and the template (D31) depend on the answer. The owner handed this study to Claude to run alone.
**Status:** [~] plan written, study running. Results are at the end of this note when finished.

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

## Results

Pending.
