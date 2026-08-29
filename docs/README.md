# Run Hack Project — Planning Docs

Planning package for the running-coach hackathon project. Start here, then read in
order; each doc is self-contained and links onward.

## Reading order

| # | Doc | What it answers |
| - | --- | --- |
| 1 | [Product thesis](product-thesis.md) | Why this exists, the one-sentence pitch, non-goals |
| 2 | [Users and journeys](users-and-journeys.md) | Who we build for, end-to-end journeys |
| 3 | [Feature concepts](feature-concepts.md) | The five idea tracks, described concretely |
| 4 | [Scope: MVP vs stretch](scope.md) | What ships in the hackathon window, what does not |
| 5 | [Acceptance criteria](acceptance-criteria.md) | Testable definitions of done for MVP work |
| 6 | [Architecture and data flows](architecture.md) | Components, sequence flows, data model |
| 7 | [Permissions, privacy, safety](permissions-privacy-safety.md) | Consent, health-data handling, coaching safety |
| 8 | [Sponsor integrations](sponsor-integrations.md) | ElevenLabs / Healf hypotheses, risks, fallbacks |
| 9 | [Decision matrix](decision-matrix.md) | Prioritized build order with scoring |
| 10 | [Milestones and ownership](milestones-and-ownership.md) | Hour-by-hour plan, owners, dependencies |
| 11 | [Demo and judging narrative](demo-and-judging.md) | The 3-minute demo script and judging mapping |
| 12 | [Assumptions register](assumptions.md) | Every unverified assumption, with how to verify |
| 13 | [Open questions](open-questions.md) | Blocking questions and who to ask |
| 14 | [Wacky ideas backlog](wacky-ideas.md) | Optional/stretch delight features |

## Conventions used in these docs

- **[ASSUMPTION]** — believed true but **not verified**. Never build a critical path
  on one without checking the [assumptions register](assumptions.md) first.
- **[QUESTION]** — must be answered by a human or by reading vendor docs.
- **[VERIFIED]** — checked against a primary source; the source is named inline.

No sponsor API shapes, endpoints, pricing, or quota numbers in these docs are
verified. They are written as questions or assumptions on purpose — see
[sponsor integrations](sponsor-integrations.md).

## Status

These docs are the product/planning layer, written independently of the prototype
that now exists on `main` (roast engine, ghost-pacer bet, live tracker PWA, Poke
sync, leaderboard — see the root [README](../README.md)). They therefore describe a
plan, not the current implementation: where the two disagree, the code is the
source of truth for *what exists* and these docs are the source of truth for *what
we decided and why*. Scope tiers, acceptance criteria, and owner slots (`@owner-*`)
are unclaimed and unreconciled against the prototype.

Highest-value follow-up: walk [acceptance criteria](acceptance-criteria.md) against
the shipped prototype and mark each criterion met / not met / superseded.
