# Self-run flow test log

**Asked by the owner, 2026-11-06.** A record of every flow test Claude runs alone, so that the same test can be repeated logged in and compared with logged out, to design the system. Add a row for every run, including failed ones.

Raw results stay in the git-ignored `recon/raw/study/<state>/`, on the PC that ran them. **Only this log and the summaries travel between PCs.** So a comparison must run on a PC holding both sets, or the earlier run must be repeated there.

## How to repeat this test

**Logged out** (no login needed):
```
node tools/recon/study.js --state logged-out --limit 900
```

**Logged in** (the owner logs in first, in the debug Chrome; Claude never logs in):
```
npm run recon -- stop
```
Then, once the owner has logged in:
```
node tools/recon/study.js --state logged-in --department 21 --limit 900
```
`--department` must be the account's **own** department. On Flow 2, a login locks the Department, and the tool won't send anything else (see "Not to be tested" in `r7-logged-in-audit.md`). The tool checks the page's login state first and refuses to run if it doesn't match `--state`.

**Compare:**
```
node tools/recon/study-compare.js
```
For each flow and filter value, it shows the pages logged out and logged in, and which field labels occur only on one side. Then record the result below.

**Expect one difference by design:** a logged-out run covers all departments, and a logged-in one may be limited to the account's department on some flows. The compare tool flags those filter values, so they aren't mistaken for login effects. Use `--department 21` on the logged-out run as well for a strict like-for-like count.

## Run log

| # | Date, time (Bangladesh) | PC | State | Scope | Requests | Result | Notes |
|---|---|---|---|---|---|---|---|
| 1 | 2026-11-06 12:13 | home | logged out | Flow 2, test | 8 | Tool worked | Size limit reached as intended |
| 2 | 2026-11-06 12:14–12:20 | home | logged out | Flows 2–5 | 74 | **Stopped early, tool fault** | Link went quiet; the tool exited with code 0. Fixed: a time limit on each call, reconnects, and a stated stop reason |
| 3 | 2026-11-06 12:26– | home | logged out | Flows 2–5, resumed | running | running | Up to 830 requests |
