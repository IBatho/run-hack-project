# Implementation milestones and ownership

Owner slots are placeholders. Claim one by replacing the handle in this file in
your first commit — that is the whole process.

## Roles

| Slot | Scope | Claimed by |
| --- | --- | --- |
| `@owner-backend` | Data model, run ingestion, API, deploy | _unclaimed_ |
| `@owner-ai` | Coach prompts, structured output, safety filter | _unclaimed_ |
| `@owner-data` | Growth score, seed data, demo narrative in data | _unclaimed_ |
| `@owner-frontend` | Web/PWA, leaderboard, audio player, consent UI | _unclaimed_ |
| `@owner-demo` | Demo script, rehearsals, backup recording (can double up) | _unclaimed_ |
| `@owner-sponsors` | ElevenLabs + Healf discovery, keys, booth questions | _unclaimed_ |

With three people, merge `@owner-data` into `@owner-backend` and let
`@owner-frontend` also own the demo.

## Milestones

### M0 — Hour 0–1: unblock everything (all hands)

- [ ] `@owner-sponsors`: get the ElevenLabs key; ask at the Healf booth
      (**Q-06**, **Q-07**, **Q-13**, **Q-15**).
- [ ] `@owner-sponsors`: answer **Q-01**/**Q-02** from Poke docs or staff.
- [ ] `@owner-frontend`: play any audio file, after a tap, on **the actual demo
      phone**. Confirms **A-03** in ten minutes.
- [ ] `@owner-backend`: repo scaffold + deployed hello-world URL. Deploy on hour 1,
      not hour 30.
- [ ] Claim owner slots in this file.

**Exit:** we know whether we have voice, whether we have Poke push, and we have a
live URL.

### M1 — Hour 1–5: skeleton and data

- [ ] Schema from [architecture](architecture.md) created and migrated.
- [ ] Run ingestion endpoint + manual entry form (**AC-3**).
- [ ] Seed script v1: 4–6 users, 6 weeks of runs (**AC-9**).
- [ ] Env/config plumbing with all `FEATURE_*` flags off by default.

**Exit:** real run records in a real database on the deployed URL.

### M2 — Hour 5–10: the thesis metric

- [ ] Growth score v1 with four separately-stored components (**AC-4**).
- [ ] `why` line generation.
- [ ] Bands, decay, clamping, newcomer handling.
- [ ] Leaderboard page, growth-ranked, with `why` lines (**AC-5**).
- [ ] Verify in seed data that a slower runner outranks a faster one.

**Exit:** the leaderboard alone tells the story. This is the point of no return —
if M2 is not done by hour 10, cut stretch items ruthlessly.

### M3 — Hour 8–16: the coach (parallel with M2)

- [ ] Prompt + schema for structured plan output (**AC-1**).
- [ ] Rules-based fallback generator.
- [ ] Adaptation path with the five test cases from **AC-2**.
- [ ] Deterministic safety filter + its unit tests.
- [ ] Post-run debrief text generation (**AC-6**).

**Exit:** typing "my knee is sore" visibly and safely changes today's session.

### M4 — Hour 14–20: voice

- [ ] `TtsClient` adapter + ElevenLabs implementation.
- [ ] Cache keyed on `template + variables + voice_id`.
- [ ] Audio storage + unguessable expiring URLs.
- [ ] Run detail screen: play button, always-visible transcript, failure state
      (**AC-7**).
- [ ] Per-user daily memo cap.

**Exit:** a judge presses play and hears a memo about a real run.

### M5 — Hour 20–27: credibility and polish

- [ ] Consent screens, separate consents, immediate revocation (**AC-8**).
- [ ] "What the coach knows about me" screen.
- [ ] Empty states, loading states, error states.
- [ ] Seed data final pass so the ordering matches the demo script exactly.
- [ ] Stretch attempts, strictly in decision-matrix order.

**Exit:** nothing on the demo path looks unfinished.

### M6 — Hour 27–32: demo lock

- [ ] **Feature freeze.** No new features after this point, only fixes.
- [ ] Rehearsal 1, timed.
- [ ] Rehearsal 2 with the LLM disabled and the network throttled.
- [ ] Backup video recorded.
- [ ] Slides: thesis, growth metric, sponsor usage, safety, what is next.

**Exit:** we could present with the wifi down.

### M7 — Hour 32–36: buffer

Bugs, a wacky feature if genuinely spare, sleep. Prefer sleep.

## Dependency graph

```text
M0 ──► M1 ──► M2 ──────────────► M5 ──► M6 ──► M7
        └───► M3 ──► M4 ────────┘
M0(sponsor keys) ──► M4
M0(Poke answers) ──► stretch S1/S2 only
```

The critical path is **M1 → M2 → M5 → M6**. Coach and voice work parallelize; the
metric does not. If one person stalls, move them onto M2.

## Working agreements

- Trunk-based, small PRs, no long-lived branches. Merge conflicts at hour 30 are
  how hackathons die.
- One shared deploy; deploy continuously from hour 1.
- Feature flags default off; nothing half-built reaches the demo path.
- 15-minute standup at hours 6, 14, 22, 28. Each person: done / next / blocked.
- Any teammate may invoke the cut list in [scope](scope.md) without a debate.
- Update [open questions](open-questions.md) the moment an answer arrives — a stale
  question wastes someone else's hour.
