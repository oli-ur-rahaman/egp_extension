# How to use the ToR prompt

The prompt itself is [TOR-PROMPT.md](TOR-PROMPT.md) — that file is **only** the prompt, so you can copy it end to end without editing anything out.

---

## Sending it

1. Open a **fresh** Claude chat. Do not reuse a chat that already has other context in it — the prompt is written to be self-contained, and stray context will bleed into the drafting.
2. **Attach the reference ToR PDF** to the same message as the prompt. Attach it first, paste the prompt second.
3. Before pasting, fill in the **Part 5** table. Anything you genuinely do not know yet stays as `TBD` — the prompt instructs Claude to turn unknowns into visible `[TO BE COMPLETED: …]` placeholders rather than inventing a number, and to list every placeholder in one table at the end.
4. Send. Claude will come back with the conventions it extracted from your PDF, then up to eight questions, then the document.

If you want a Word-ready file at the end, ask for it after Step 4 — do not add it to the prompt, or it will start optimising for format instead of substance while drafting.

---

## Why the prompt is built the way it is

| Design choice | Reason |
|---|---|
| Reference PDF used for **form, not content** | Otherwise the draft drifts toward the reference project's subject matter, and you get a civil-works ToR with software words substituted in. |
| Claude reports the conventions **before** drafting | Gives you a checkpoint. If it misread the reference, you find out in three lines instead of after twenty pages. |
| Cascading filters called out as the "most misunderstood requirement" | It is. A developer who plans a fixed list of filter combinations before starting will build something that cannot work, and you will not discover it until acceptance. |
| Outcome-based specification | Prescribing libraries and internal design in a ToR transfers the design risk to *you*. If you specify the how and it fails, that is your defect, not the developer's. |
| Every requirement must be testable | An untestable requirement is a requirement you cannot enforce at acceptance. This is where procurement disputes come from. |
| No invented figures | A ToR that quietly contains a hallucinated budget or duration is worse than one with obvious blanks. |
| Step 4 reviewer's note | Turns the same model into a critic of its own draft. The "where am I exposed" question is the one a consultant would charge you for. |

---

## Before you issue it to bidders

Check each of these in the returned draft.

- [ ] Every `[TO BE COMPLETED: …]` placeholder is filled or deliberately removed.
- [ ] The **cascading-filter** requirement survived as a numbered obligation, not an aside in a paragraph.
- [ ] The **resumability** requirement is stated as a testable acceptance test, not as "the system shall be robust". This is the requirement that most affects whether the delivered tool is usable.
- [ ] The **fail-loud-on-structural-change** clause is present. Without it, a bidder can deliver something that silently produces wrong data and still claim conformance.
- [ ] **Acceptance criteria** are things you can witness in a live demonstration, not things you have to take on trust.
- [ ] **Warranty and maintenance** cover portal changes *after* handover. On this project that is the recurring cost, not the build — the e-GP portal will change, and a ToR with no maintenance obligation leaves you re-procuring from scratch each time it does.
- [ ] **Source code ownership** is unambiguous, and explicitly includes the site configuration file and the test fixtures — not just the application code. Those two artefacts are what make the tool maintainable by anyone other than the original developer.
- [ ] The **legal and ethical compliance** section states that the system operates through your own authorised account and performs no access-control circumvention. This protects you as much as it constrains the developer.

---

## A note on publishing it

If the ToR will be issued publicly, read the scope section once more with that in mind. It describes, in specific detail, an automated collection tool aimed at a named government portal. That is legitimate work, and the prompt already frames it correctly — authorised account, no circumvention, self-limiting request rate. But a public tender document is read by people who did not ask for the context, so it is worth making sure the framing in Part 2's *Operating principle* survives into the final draft's opening sections rather than being buried in a compliance annex.

If the tender is limited or direct, this matters less.

---

## Related

- [PROJECT_PLAN.md](../PROJECT_PLAN.md) — the full technical plan of record
- [plan.html](plan.html) — the visual version of the same plan ([published copy](https://claude.ai/code/artifact/558f5048-8a9b-4e6e-a715-233f0c755bee))

If a bidder asks a technical question the ToR does not answer, the plan of record is where the answer is. Do not hand the plan of record to bidders wholesale, though — it contains implementation decisions, and issuing it turns your outcome-based ToR back into a prescriptive one.
