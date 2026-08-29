# Feature concepts

Five tracks. Tracks 1–3 are the product; track 4 is the differentiator we demo;
track 5 is optional delight. Scope decisions live in [scope](scope.md).

---

## Track 1 — Poke running coach

A conversational coach reachable in the chat surface the user already uses.

### Capabilities

| Capability | Description | Tier |
| --- | --- | --- |
| Onboard | 4-question intake → 1-week plan | MVP |
| Nudge | Scheduled pre-run message, adaptive tone | MVP |
| Adapt | Rewrite today's session from free-text context ("tired", "sore knee", "only 20 min") | MVP |
| Debrief | Post-run summary with one specific improvement cue | MVP |
| Plan ahead | Multi-week progression with deload weeks | Stretch |
| Recall | "What was my best 5k?" style history questions | Stretch |

### Design notes

- **One question per message.** Chat coaches that ask five things at once get one
  answer back.
- **The plan is data, not prose.** The LLM emits a structured plan object
  (`sessions[]` with type, duration, target effort, notes); the chat text is
  rendered from it. This keeps the leaderboard, memos, and UI consistent and makes
  the coach testable.
- **Bounded adaptation.** The model may change duration, intensity, and rest, and
  may recommend rest; it may not diagnose, prescribe treatment, or push past
  configured caps (see [safety](permissions-privacy-safety.md)).
- **Deterministic fallback.** If the LLM is unavailable, a rules-based plan
  generator (easy/steady/long rotation scaled to reported weekly volume) still
  produces something sane. Cheap insurance for demo day.

### Poke-specific unknowns

Whether the coach can *initiate* messages on a schedule, message a group, or only
reply to inbound user messages is **unverified**. This determines whether nudges
are push or pull, which is a load-bearing product decision.
See **[QUESTION Q-01]** and **[QUESTION Q-02]** in [open questions](open-questions.md).

Design so that this can flip: all outbound messages go through one
`Notifier` interface with a `poke` implementation and a `pull-only` fallback where
the "nudge" is simply the reply the user gets when they message in, plus a web
inbox showing what would have been sent.

---

## Track 2 — Relative-growth leaderboard

Ranking by rate of self-improvement rather than absolute performance.

### Growth score (v1, deliberately simple)

Per user, per week, computed from at most four inputs so it stays explainable:

```text
growth =  0.45 * pace_improvement_at_equal_effort   # normalized, clamped
        + 0.25 * consistency                        # sessions_done / sessions_planned
        + 0.20 * volume_progression                 # week vs 3-week trailing mean, clamped
        + 0.10 * plan_adherence                     # session type matched the plan
```

Rules that make it survive contact with reality:

- **Baseline window:** the trailing 3 weeks (or a synthesized baseline from
  onboarding answers for a brand-new user).
- **Clamping:** every component is clamped to `[-1, 1]` before weighting, so one
  freak 10k cannot dominate.
- **Newcomer handling:** users with fewer than 3 recorded runs are shown in a
  separate "Getting started" band, not the main ranking. Prevents the trivial
  exploit of "run terribly once, then normally".
- **Decay, not reset:** an inactive week multiplies the previous score by `0.8`
  rather than zeroing it, so returning after a lapse is cheap
  (see [lapse journey](users-and-journeys.md)).
- **Effort normalization:** ideally heart-rate-based; if HR is absent, fall back to
  pace adjusted for distance and elevation. The elevation/HR-free approximation is
  crude and we should say so. **[ASSUMPTION A-02]**
- **Explainability requirement:** every ranked row must render a one-line "why",
  e.g. "+8% pace at equal effort · 3/3 runs". If we cannot explain a rank, the
  metric is wrong.
- **Anti-cheat, minimal:** reject sub-human paces, implausible distances, and
  duplicate overlapping activities. Nothing more; this is a hackathon.

### Views

- Personal growth trend (sparkline, 6 weeks).
- Group leaderboard, growth-ranked, with the "why" line.
- Weekly "biggest improver" callout for the group digest.

### Known tension

Consistent Sam, already near his ceiling, will rank below improving beginners.
Mitigation: a second "Consistency" board, and consistency weighted into growth as
above. Do not pretend this tension does not exist — judges will ask.

---

## Track 3 — Sponsor integrations (ElevenLabs, Healf)

Full treatment, including risks and fallbacks, in
[sponsor integrations](sponsor-integrations.md).

- **ElevenLabs** — voice for coach memos. Our belief is that a synthesized coach
  voice is the single highest-impact-per-hour feature in the whole project.
- **Healf** — health/wellness context to enrich coaching (e.g. sleep, recovery,
  or product/nutrition context). **We do not know Healf's API surface.** No
  endpoint, auth model, or data field is assumed; everything is a question.

---

## Track 4 — Voice memos to headphones

The differentiator: the coach speaks to you, in your ear, at the moment it matters.

### Delivery paths, best to worst

1. **Native audio playback while the app/PWA is foregrounded.** Trivially works.
   Suitable for demo. **[ASSUMPTION A-03]**
2. **Notification with attached audio, tapped by the user.** Reliable but requires
   a tap.
3. **Auto-play audio from a background notification without user interaction.**
   This is the magic version and is the one most likely to be blocked by the
   platform. Browsers require a user gesture for audio playback, and mobile OSes
   restrict background audio. Whether any "notification speech" permission gives
   us hands-free playback is **unverified**. **[QUESTION Q-05]**
4. **OS accessibility / spoken-notification features** (e.g. announce
   notifications over headphones). This is a user-side setting we cannot rely on
   or configure for them, but it is a legitimate "it works today" story if the
   user has it enabled.

### Design notes

- Memos are **short**: 8–20 seconds. Target ~40–60 words.
- Memos are **pre-generated** where possible (post-run debrief is generated as
  soon as the workout lands) so playback is instant, not blocked on TTS latency.
- Every memo has a **text transcript** shown alongside — accessibility, and a
  fallback when audio cannot play.
- Mid-run memos are **rate-limited** (at most one per configured interval, default
  10 minutes) and mutable/skippable. An unsilenceable voice in your ear is a
  nightmare, not a feature.
- **Cache aggressively** by memo template + variables; identical memos should not
  cost a second TTS call.

---

## Track 5 — Wacky features (optional / stretch only)

See [wacky ideas](wacky-ideas.md). None of these are on the critical path, and none
should be started before the MVP acceptance criteria pass.
