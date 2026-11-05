# Time estimate and sprints

**Decision D27 (owner, 2026-11-06).** Before every flow starts, the user sees a tentative time. Long runs get a warning, practical ways to shorten them, and a way to split the run into sprints.

**Status:** design. Built in M13 and M8. The numbers below are planning values, to be replaced by measurements as noted.

## 1. What the user sees

Shown after the filters and checkerboard are set, directly above **Start**:

```
┌────────────────────────────────────────┐
│  ESTIMATE                              │
│  71,190 contracts · 25 fields ticked   │
│                                        │
│  About 2.5–3.5 days                    │
│  List 45 min  +  Detail pages 69 h     │
│                                        │
│  ⚠ Too long for one sitting            │
│                                        │
│  Ways to shorten it                    │
│  ○ List only, no detail pages   45 min │
│  ○ Split into 12 sprints     ≈ 6 h each│
│  ○ Signed in 2025 only          ≈ 14 h │
│  ○ One Procuring Entity         ≈ 20 min│
│                                        │
│  ☐ I understand this will take days    │
│       [ Start anyway ]                 │
└────────────────────────────────────────┘
```

It is always a range and always says "about". It updates when a filter or tick changes. During the run it becomes a live "time left", from the speed actually measured.

## 2. How the estimate is made

**Step 1: count the work, with one real request.** The panel sends the search once and reads the portal's `totalPages` (with the row count of the last page where needed). So the estimate rests on the real size of this search. It costs 1–2 requests, and the D22 contractor limit reads the same number.

| Flow | List requests | Detail requests |
|---|---|---|
| 1 Procurement Transaction | one per office | none |
| 2–5 | rows ÷ 100, rounded up | one per row, **if any field is ticked** |

**The number of ticks doesn't change the time.** All the fields on a detail page arrive in one request, so ticking 1 field costs the same as ticking 30. The real choice is detail pages or none. The panel says so, so nobody unticks fields hoping to save time.

**Step 2: apply the time per request.**

```
Time = list requests   × (pace + list response time)
     + detail requests × (pace + detail response time)
     + export time
```

| Value | Planning figure | Source | Replaced by |
|---|---|---|---|
| Pace (polite gap between requests) | 3 s | planning assumption | M8, the rate governor's real setting |
| List response | Flow 2: 1–1.7 s (status All). Flow 3: 0.2–2.3 s. Flow 4: 1 s. Flow 5: 0.2–0.4 s, or 2–6 s with a text match | measured | stored in the Site Profile per flow |
| Detail response | not yet measured; 0.5 s assumed | assumption | measured in M7 |
| Export | under 1 min | assumption | M10 test |

**Step 3: make it a range, not a false promise.**

- **Low:** the planning figures.
- **High:** planning figures × 1.5, for slow-downs, recovery pauses and session expiry.
- The range is shown rounded: "about 6–9 hours", never "6 h 42 min".

**Step 4: learn from real runs.** Each finished run stores its measured time per list and detail request, per flow, on this PC only. The next estimate uses the median of the last 5 runs in place of the planning figure. So estimates improve with use, and they reflect this PC's connection. No data leaves the machine.

**During a run:** time left = work left × the median of the last 200 requests. It's labelled honestly: `≈` while branches are still being discovered, and "paused" during recovery.

**A run that needs a repeat sweep:** if the row count falls short (the row-loss problem in `recon/flow-2.md`), the extra sweep is added to the live estimate and the panel says why. Its size is unknown until M6 settles the fix.

## 3. Warning levels

| Estimate (high end) | Level | What the panel does |
|---|---|---|
| Up to 1 hour | Normal | Shows the time |
| 1 to 6 hours | Note | Shows the time and "you can stop and resume at any time" |
| **Over 6 hours** | **Warning** (owner's limit) | Amber. Shows ways to shorten it and offers sprints |
| **Over 24 hours** | **Unrealistic** | Red. Same options, and Start needs a tick: "I understand this will take days" |
| Over 7 days | **Unrealistic, strongly** | Red. Says plainly that this is unlikely to finish, and recommends splitting. Start still needs the tick |

Nothing is ever blocked by time alone. The user decides. The mandatory filters (D13, D15, D19, D20) are a separate rule and stay.

Run limits behind the warnings: Flow 1 needs a login, and a session ended at midnight once (`recon/r7-logged-in-audit.md`), so a Flow 1 run crossing midnight gets a note saying it may pause for login.

## 4. Ways to shorten a run

Shown only when they help, and only for filters that exist on that flow, ranked by time saved, each with its own computed time. **Never "go faster":** the pace protects the portal and the account, and it isn't offered as a setting.

| Suggestion | Applies when | How its time is worked out |
|---|---|---|
| **List only, no detail pages** | Any field ticked | Already known |
| **Two stages:** list now, details later for chosen rows | Any field ticked | List time now; detail time on the rows chosen |
| **Narrower date window** | Flows 2, 4, 5 | One count request for the most recent year |
| **One Procuring Entity** | Flows 2–5 | One count request, or the total ÷ offices, marked "about" |
| **One more filter**, such as Nature, Method or Budget Type | Flows 2–5 | One count request, for the filter likeliest to help |
| **One contractor** | Flows 4, 5 | Usually minutes (D21) |
| **Fewer offices** | Flow 1 | Offices × time per report |
| **Split into sprints** | Over 6 hours | See below |

To stay polite, the panel sends **at most 3 extra count requests** per estimate, and only when the run is over 6 hours. Others show as "about" from arithmetic alone.

## 5. Sprints

**A sprint** is one part of a run, small enough to finish in one sitting. It produces its own workbook, with its own About sheet. The existing plan already defines a sprint as one execution that yields one `.xlsx`, so this fits.

**Target:** at most **6 hours** each, the owner's limit, adjustable by the user.

**How a run is split, in order of preference:**

1. **By date**, where the flow has a window (Flows 2, 4, 5). Natural, and one window can't overlap another. Windows narrow until each sprint fits the target, using count requests.
2. **By Procuring Entity**, where it has no window (Flow 3), or a single day is still too big.
3. **By office batch** on Flow 1.

**Sprint plan shown before Start:**

```
Sprint  Window                     Rows     Time
  1     01/01/2025 – 30/04/2025    5,900   ≈ 6 h
  2     01/05/2025 – 31/08/2025    5,700   ≈ 5.8 h
  …
 12     01/09/2021 – 31/12/2021    4,800   ≈ 5 h
```

- Sprints run **one at a time**, and the user chooses when. Nothing starts by itself.
- The plan is saved, so it survives a browser restart, like any checkpoint.
- A window can't be split finer than one day, and date filters may behave oddly at the edges, so **M6 must test** that windows neither overlap nor leave gaps. Each row is deduplicated by its ID anyway.
- **Combine at the end:** when all sprints are done, one button makes a single workbook from all of them, deduplicated, with an About sheet covering the whole run. Its row count is checked against the sum of the sprints.
- The portal's Excel limit of about 1 million rows is checked before combining.

**A useful side effect:** sprints with date windows that fit on few pages may also reduce the row loss from page boundaries. That is tested in M6, not assumed.

## 6. Worked examples (planning figures)

| Search | Rows | List | Detail pages | Level |
|---|---|---|---|---|
| Flow 5: one contractor | about 50 | under 1 min | about 3 min | Normal |
| Flow 2: PWD, one division, 3 years | 473 | under 1 min | about 30 min | Normal |
| Flow 1: one year, all 224 offices | 224 reports | about 15 min | none | Normal |
| Flow 3: PWD, one year, list only | 18,400 | about 15 min | none | Normal |
| Flow 5: PWD, Tender Type All | 15,800 | about 15 min | about 15–23 h | Warning |
| Flow 3: PWD, one year, with details | 18,400 | about 15 min | about 18–27 h | **Unrealistic** |
| Flow 4: PWD, 5 years, with details | 71,190 | about 45 min | about 2.9–4.3 days | **Unrealistic** |

## 7. Build and tests

| Task | Module | Description |
|---|---|---|
| M13-T08 | M13 | Estimate card: count request, range, warning levels, Start confirmation |
| M13-T09 | M13 | Suggestions with computed times, at most 3 count requests |
| M13-T10 | M13 | Sprint planner, sprint list, combine at the end |
| M8-T06 | M8 | Timing store: measured per-request times per flow, median of the last 5 runs; live time left |
| M10-T07 | M10 | Combine sprints: dedupe, About sheet for the whole run, row-limit check |

**Automated tests:** M13-AT4 estimate arithmetic and each warning boundary (exactly 1 h, 6 h, 24 h, 7 days) · M13-AT5 suggestions appear only when they apply, and never suggest speed · M13-AT6 at most 3 extra count requests · M13-AT7 sprint plan covers the whole window with no gap or overlap · M8-AT5 estimate moves to measured values after runs · M10-AT4 combined file equals the deduplicated sum of its sprints.

**Your checks:** M13-MC6 the estimate on a real search looks believable · M13-MC7 a 6-hour-plus search warns and offers sprints · M13-MC8 after a real run, the estimate was within its range; if not, the multiplier is corrected.
