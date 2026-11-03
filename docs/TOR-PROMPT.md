You are a senior procurement consultant who writes Terms of Reference for software development tenders. You have drafted ToRs for both public-sector and private-sector ICT procurements, and you know how a weak ToR causes disputes later: vague acceptance criteria, unowned source code, no maintenance clause, and specifications that describe an implementation instead of an outcome.

I am procuring the development of a custom software tool through a tender. I need you to write the complete Terms of Reference document.

---

# PART 1 — THE ATTACHED REFERENCE

I have attached a ToR written by a professional consultant for a different project. Use it as the model for **FORM, not for content**:

- Section structure, numbering convention and ordering
- Level of formality, register and sentence construction
- How much detail each section carries
- How obligations are phrased (shall / will / must)
- Table conventions, annex conventions, cross-referencing style
- Front matter and boilerplate a document of this kind carries

Do **not** copy its subject matter, its scope, or its technical content. If the attached ToR is for a different sector (civil works, consultancy, supply), translate the conventions to a software development engagement rather than forcing this project into that shape.

Before you write, tell me in 5–8 bullets what conventions you extracted from the attached document and will follow. If the attachment is unreadable or missing, say so plainly and ask me to re-attach — do not proceed on a guess.

---

# PART 2 — WHAT I AM PROCURING

A private Google Chrome browser extension that automates the collection of publicly reported procurement data from the Bangladesh electronic Government Procurement (e-GP) portal, `eprocure.gov.bd`, and outputs it as structured Excel workbooks.

## Operating principle

The tool automates clicks a user already performs manually, inside the user's own authenticated browser session. The user logs in personally; the extension never handles, stores or transmits credentials. It obtains no data the user could not obtain by hand. It performs no authentication bypass, no CAPTCHA solving and no evasion of any access control.

## Reporting flows in scope

Five report pages, in two structural patterns.

**Pattern A — list page only**
1. Procurement Transaction Report
2. Tender Info

**Pattern B — list page, plus a detail page opened per result row**
3. APP Info
4. Contract Info
5. Experience Info

For Pattern B the tool must open each row's detail page in a background tab, extract it, close the tab and return to the list without disturbing the list's pagination state.

## Core functional behaviour

1. **Filter mirroring.** On opening, the extension reads the report page's own filter controls and reproduces them inside its own interface, so the user configures the run from one place.

2. **"All" iteration.** Every mirrored filter carries an "All" option. Any filter set to "All" is iterated exhaustively across all its values, and the results of every iteration are consolidated into one output.

3. **Cascading filters.** Several filters are dependent: a child filter's option list does not exist until its parent is selected (for example Ministry → Agency → Procuring Entity). The tool must therefore discover the combination space progressively during execution — selecting each parent value, waiting for the child list to populate, then descending — rather than computing a fixed list of combinations before starting. **This is the single most commonly misunderstood requirement.** Make sure the ToR states it unambiguously and that bidders must demonstrate they understand it.

4. **Pagination.** All result pages of every combination must be collected.

5. **Interruption tolerance.** A long run may be interrupted by the portal slowing down, rate-limiting, erroring, or expiring the session, or by the browser being closed. The tool must record progress continuously so that any interruption resumes from the last completed unit of work with no data lost and no duplicated records. Resumption must survive the browser being closed and reopened.

6. **Graded recovery.** Transient failures must be handled by escalating responses — retry, timed backoff, session reset, extended cool-down, and finally a supervised pause — rather than by aborting the run.

7. **Session expiry.** When the portal returns the user to the login screen, the tool must pause, prompt the user to log in again, and resume automatically once the session is restored.

8. **Adaptive pacing.** Request rate must be self-limiting and must slow down in response to observed portal latency, so that the tool does not place unreasonable load on the portal.

9. **Fail loud on structural change.** If the portal's page structure changes such that the tool can no longer be certain it is reading the correct fields, it must stop and report, and must **not** export data it cannot vouch for. Silent partial or misaligned extraction is the single worst outcome and must be treated as a defect of the highest severity.

10. **Excel export.** One workbook per run: a single sheet, a single flat table. Every record must carry provenance — which filter combination and which source page it came from, and when it was captured. Dates must be written as date values, identifiers as text so leading zeros survive, and missing values must be empty rather than zero or a placeholder string. The run must also produce a reconciliation summary comparing records collected against the totals the portal itself reports.

11. **Externalised site definition.** Every page address, element locator and column mapping must live in a single versioned configuration file, separate from program logic, so that the tool can be adapted to portal changes by editing configuration rather than rewriting code.

12. **Change resilience and self-check.** Before each run the tool must verify that every element it depends on is still present, and refuse to start if not, naming what is missing. It must be able to produce a machine-readable "drift report" describing what changed, to support rapid repair.

13. **Maintenance mode.** A hidden maintenance interface, protected by a passphrase known only to the owner, exposing diagnostics, the drift report and the ability to apply and roll back a configuration repair.

## Explicitly excluded

- Publication to the Chrome Web Store
- Any handling, storage or automation of login credentials
- Any server-side component; the tool runs entirely in the user's browser
- Downloading of tender attachments or documents (may be a future phase)
- Any circumvention of access controls, CAPTCHA or rate limiting
- IP address rotation or origin masking

## Scale and environment

- Single user, single workstation, Windows, Google Chrome
- Typical run: in the order of a few thousand records
- Installed as an unpacked extension from source

---

# PART 3 — REQUIRED STRUCTURE OF THE ToR

Include these sections, in a professional order consistent with the attached reference. You may rename them to match the reference's conventions.

1. **Introduction and background**
2. **Objectives** — one general objective, several specific objectives
3. **Scope of work**
4. **Functional modules** — each with purpose, behaviour and boundaries; at minimum: configuration and filter mirroring; combination planning and execution; data extraction (list); data extraction (detail); progress persistence and resumption; rate control and recovery; data validation and reconciliation; export; integrity monitoring and maintenance; logging and audit
5. **Deliverables** — grouped as software, source code, documentation, testing artefacts, and training/handover; each with an acceptance basis
6. **System specifications** — functional, data, performance, security, usability, compatibility and maintainability requirements
7. **Required qualifications and experience of the developer** — mandatory and desirable criteria clearly separated
8. **Everything further that a ToR of this class requires**, which in your judgement must include:
   - Implementation methodology and phasing
   - Timeline, milestones and the deliverable due at each
   - Testing and quality assurance protocol, including user acceptance testing and who signs off
   - Acceptance criteria — objective and testable
   - Warranty period and post-deployment maintenance obligations
   - Intellectual property, source code ownership and handover
   - Confidentiality and data protection obligations
   - Legal and ethical compliance, and the developer's obligation to operate only within authorised use of the client's own account
   - Institutional arrangements, reporting lines and communication
   - Payment schedule linked to accepted milestones
   - Risks, assumptions and dependencies, with mitigation
   - Proposal requirements — what a bidder must submit
   - Evaluation criteria with an indicative technical/financial weighting and a scored technical breakdown
   - Change management for scope variations
   - Annexes: flow-by-flow requirement matrix, glossary of terms, deliverable acceptance checklist

---

# PART 4 — HOW TO WRITE IT

- **Specify outcomes and constraints, not implementation.** State what the system must do and how its success is measured; do not mandate specific libraries, frameworks or internal designs. Bidders should be free to propose their approach and be evaluated on it. Where a constraint is genuinely non-negotiable (browser extension for Chrome; no server-side component; no credential handling), state it as a constraint and say why.

- **Make every requirement testable.** Any requirement that cannot be verified at acceptance is a future dispute. Prefer *"the system shall resume an interrupted run from the last completed combination with no duplicated or omitted records, demonstrated by an interruption test during UAT"* over *"the system shall be reliable"*.

- **Use "shall" for obligations.** Number requirements so they can be cited in a bid, in an evaluation sheet and in an acceptance test.

- **Do not invent facts.** Any budget, duration, date, entity name, contact point or procurement rule I have not given you must appear as a clearly marked placeholder in the form `[TO BE COMPLETED: …]`. At the end of the document, list every placeholder in one table so I can fill them in.

- **Flag your assumptions.** Keep a short "Assumptions made in drafting" note at the end, separate from the ToR body, listing anything you inferred.

- Write in formal, plain professional English. No marketing language, no filler, no emoji. Tables where a table is clearer than prose.

- Length should follow the reference document. Do not pad; do not compress a section that carries real obligations.

---

# PART 5 — MY PROCUREMENT DETAILS

> **Fill this in before sending. Write TBD where you do not know yet.**

| Field | Value |
|---|---|
| Procuring entity name and type | `[private firm / government body / NGO]` |
| Applicable procurement rules | `[e.g. PPR 2008, internal policy, or none]` |
| Country / jurisdiction | Bangladesh |
| Tender type | `[open / limited / RFQ / direct]` |
| Indicative budget or ceiling | `[TBD]` |
| Expected contract duration | `[TBD]` |
| Required start date | `[TBD]` |
| Bid submission deadline | `[TBD]` |
| Contact person and address | `[TBD]` |
| Language of the ToR | English |
| Currency | BDT |
| Will the ToR be published publicly? | `[yes / no]` |

---

# PART 6 — PROCESS

Work in this order.

**Step 1.** Read the attached reference ToR and report the conventions you will follow (5–8 bullets, as instructed in Part 1).

**Step 2.** Ask me any clarifying questions that would materially change the document — a maximum of eight, and only ones where a wrong assumption would cause real damage. Do not ask about things I have already specified above. Do not ask questions you can reasonably answer with a marked placeholder.

**Step 3.** After I answer, produce the complete ToR in one piece, as a formatted document. Do not deliver it in fragments and do not summarise it back to me instead of writing it.

**Step 4.** After delivering it, give me a short reviewer's note: the three clauses most likely to be disputed by a bidder, and the three places where I am most exposed if the developer underperforms.

Begin with Step 1.
