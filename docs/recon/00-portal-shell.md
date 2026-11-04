# Recon R1 — Portal shell

**Sessions:** R0 + R1, 2026-11-04 · **Driver:** owner, in the debug Chrome (`npm run chrome`) · **Observer:** Claude over CDP
**Status:** [~] in progress

Raw captures are in `recon/raw/` (git-ignored, on the home PC only). Only findings are recorded here.

## R0 — Link-up

- [x] Debug Chrome 156.0.8078.74 on port 9222, separate profile. `npm run recon -- ping` connects.

## Platform

- Server-rendered **Java/JSP** site (`*.jsp` pages, inline `onclick`/`onchange` handlers). Assumption A3 (HTML pages, not a single-page app) holds so far.
- Language switch on every page: `select#idlanguage` (English / Bangla), `onchange="changelanguage(this.value)"`. Recon is done in **English**. Label-based selectors must assume the English UI (assumption A5).

## Pages and states

| Page ID | State | URL | Signature | Notes |
|---|---|---|---|---|
| P-0.2a | **Post-login interstitial: update mobile number / NID** | `/UpdateMobileNid.jsp?invalidMobNid=true` | `#txtMobile`, `#otpTxt`, `#sendOTP`, `#verifyOTP`, `#btnMobileSubmit`, `#btnUpdateLater` | Appears right after login. Has an OTP flow and an **Update Later** button. The extension must classify this page as *not a report page* (Sentinel: blocked by a portal prompt; ask the user), never as `SHAPE_CHANGED`. It never fills or submits this form. |

| P-0.1 | **Logged-out homepage with login form** | `/` (title "Welcome to e-GP"; also `/Index.jsp`) | `#txtEmailId`, `#txtPassword`, `#btnLogin` (`onclick="return checkLogin();"`) | There's no separate login page: the form is on the homepage. The form's presence is the logged-out signature, meaning `LOGIN_WALL` for Flow 1 and the **expected state** for Flows 2–5 (D11). The extension never reads or fills these fields. |

The logged-out menu is the same public set (Advance Search, eTenders, Annual Procurement Plans, eContracts, eExperience, Debarred Tenderers, Reports, Offline Tenders/Contracts), with "Home Page" where a logged-in user has "My Dashboard". The My Account, Help and officer report menus are absent.

## Global navigation (logged in)

The top menu shows on every page.

| Menu item | Path | Likely flow |
|---|---|---|
| My Dashboard | `/resources/common/InboxMessage.jsp` | — |
| Advance Search | `/resources/common/AllTenders.jsp?h=t` | Flows 2–5: owner says use the homepage search dropdown → Advanced Search, **logged out** (D11) |
| eTenders | `/resources/common/StdTenderSearch.jsp?h=t` | Flow 2 Tender Info? |
| Annual Procurement Plans | `/resources/common/SearchAPP.jsp` | Flow 3 APP Info |
| eContracts | `/resources/common/SearchNOA.jsp` | Flow 4 Contract Info |
| eExperience | `/resources/common/SearcheCMS.jsp` | Flow 5 Experience Info |
| Debarred Tenderers | `/resources/common/DebarmentRpt.jsp` | out of scope |
| Reports | `/RegistrationDetails.jsp` | Flow 1 Procurement Transaction Report? |
| Offline Tenders / Contracts | `SearchTenderOffline.jsp`, `SearchAwardedContractOffline.jsp` | out of scope |
| Logout | `/Logout.jsp` | P-0.6 |

### Logged-in menus (officer account)

After "Update Later", the portal lands on **P-0.2 Message Box** (`/resources/common/InboxMessage.jsp`): the inbox, plus a "Today's To Do List". The menu depends on the account's role. These items appear only when logged in:

| Menu | Item | Path |
|---|---|---|
| Reports | Procurement Statistics | `/report/AppMIS.jsp` |
| Reports | Annual Procurement Plan | `/officer/SearchPackageReport.jsp` |
| Reports | **Procurement Transaction Report** | `/report/ProcTransReport.jsp` → **Flow 1** |
| Reports | PROMIS Report / PROMIS Overall Report | `/admin/PromiseIndicator.jsp`, `/admin/PromiseOverallReport.jsp` |
| Reports | DLI1 Report | `/resources/common/AllTenders.jsp?h=f` |
| My Account | View / Edit Profile, Change Password, Hint Q&A, Preference | `/admin/…` (never touched by the extension) |
| Help | Page Help, User Manual | `/resources/common/Help.jsp?pageName=…`, `userManual.jsp` |

Profile links carry the account's user ID in the query string. It is deliberately not recorded here.

The header also has a quick search: `select#cmbSearchTab` (eTenders / Annual Procurement Plans / eContracts / eExperience) with `input#txtKeyword` and `#btnKeyword`.

The mapping from flow to page is a guess from the menu labels. Each one is confirmed in its own session (R2–R6).

## Still to capture in R1

- [x] P-0.2 dashboard after "Update Later" (Message Box)
- [ ] Owner confirms which page each flow means (two APP candidates: public `SearchAPP.jsp` vs officer `/officer/SearchPackageReport.jsp`)
- [ ] P-0.3 the Reports menu and the route to each of the five report pages; whether direct URLs work after a refresh
- [ ] P-0.4 session expired (idle timeout length, redirect)
- [x] P-0.1 login form signature (logged out), on the homepage
- [ ] P-0.6 logout result. Done last, because it ends the session.
- [ ] Session cookie **name** only
- [ ] `/TermsNConditions.jsp`: read for automation clauses (PROJECT_PLAN §7.1)
