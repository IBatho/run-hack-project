# Acceptance criteria

Written so any teammate can verify them without asking the author. Format:
`Given / When / Then`. Tier is MVP or Stretch, matching [scope](scope.md).

## AC-1 — Onboarding produces a structured plan (MVP, M5)

- **Given** a new user with no run history,
- **When** they complete the 4-question intake,
- **Then** a plan record is persisted containing exactly 3 sessions for the next 7
  days; each session has `type ∈ {easy, steady, long, rest}`, `duration_min`,
  `target_effort`, and a `note` under 140 characters;
- **And** the chat reply lists the 3 sessions with days;
- **And** if the LLM call fails, the rules-based fallback still produces a valid
  plan record and the user sees no error.

## AC-2 — Coach adapts to free-text context (MVP, M6)

- **Given** a user with today's session = `easy, 25 min`,
- **When** they send "my knee is sore",
- **Then** today's session is replaced with either a reduced session
  (`duration_min <= 20`) or `rest`;
- **And** the reply states one reason in one sentence;
- **And** the reply contains the safety line ("not medical advice; see a
  professional for pain that persists");
- **And** the reply contains no diagnosis, condition name, or treatment
  instruction (see the [prohibited-output list](permissions-privacy-safety.md)).

Test cases that must all pass: "sore knee", "exhausted", "only have 20 minutes",
"feeling great, can I do more?" (must *not* exceed the volume cap), "I have chest
pain" (must escalate to the emergency-language response and not adapt the plan).

## AC-3 — Run ingestion (MVP, M2)

- **Given** an authenticated demo user,
- **When** a run is submitted with distance, duration, date, and optional
  average HR and elevation,
- **Then** a run record is persisted, normalized to metric internally;
- **And** implausible runs are rejected with a readable message: pace faster than
  2:00/km, distance over 100 km, duration over 12 h, or a date in the future;
- **And** a run overlapping an existing run's time window is flagged as a
  duplicate rather than double-counted.

## AC-4 — Growth score is computed and explainable (MVP, M3)

- **Given** a user with at least 3 runs across at least 2 prior weeks,
- **When** the weekly score job runs,
- **Then** a score row is persisted with all four components stored separately,
  each clamped to `[-1, 1]`, and the composite in `[-1, 1]`;
- **And** a human-readable `why` string of at most 80 characters is stored;
- **And** a user with fewer than 3 runs receives `band = "getting_started"` and is
  excluded from the main ranking;
- **And** a user with zero runs this week but a prior score gets
  `score = 0.8 * previous` (decay, not reset).

## AC-5 — Leaderboard ranks by growth, not pace (MVP, M4)

- **Given** the seeded demo group,
- **When** the leaderboard is opened,
- **Then** rows are ordered by composite growth descending;
- **And** at least one user with a slower average pace ranks above a faster user
  (this is the demo's central visual proof, so it must be true in seed data);
- **And** every row shows its `why` line;
- **And** `getting_started` users appear in a separate section below;
- **And** the page renders in under 2 seconds with 20 users and 6 weeks of runs.

## AC-6 — Post-run debrief text (MVP, M7)

- **Given** a newly ingested run,
- **When** the debrief is generated,
- **Then** the text is 40–70 words and contains exactly three elements: one
  specific positive tied to actual numbers from the run, one improvement cue, and
  the current growth delta;
- **And** it references at least one real value from the run record (distance,
  duration, pace, or HR) — no generic praise;
- **And** generation completes within 10 seconds or the user sees a
  "still thinking" state rather than a spinner that never resolves.

## AC-7 — Voice memo playback with transcript (MVP, M8)

- **Given** a generated debrief and a user who has granted audio consent,
- **When** they open the run detail screen and press play,
- **Then** audio plays through the connected output device;
- **And** the transcript is visible on screen at all times, not behind a toggle;
- **And** audio duration is between 8 and 25 seconds;
- **And** if TTS generation fails, the transcript is still shown with a clear
  "audio unavailable" state;
- **And** a repeat request for the same memo is served from cache without a second
  TTS call (verifiable in logs).

## AC-8 — Consent gating (MVP, M9)

- **Given** a user who has not granted consent,
- **When** any feature attempts to read health data or deliver audio,
- **Then** the attempt is blocked and the consent prompt is shown;
- **And** health-data and audio consents are recorded **separately** with
  timestamps;
- **And** revoking either consent takes effect immediately and stops the
  corresponding behaviour;
- **And** revoking health consent deletes or detaches previously imported health
  data (which of the two is a decision — see [Q-09](open-questions.md)).

## AC-9 — Seeded demo data tells the story (MVP, M10)

- **Given** a fresh database,
- **When** the seed script runs,
- **Then** 4–6 users exist with 6 weeks of runs each, including: one
  slow-but-rapidly-improving user, one fast-but-flat user, one lapsed-then-returned
  user, and one brand-new user in the `getting_started` band;
- **And** the resulting leaderboard order is deterministic and matches the
  ordering asserted in the demo script;
- **And** the script is idempotent — running it twice does not duplicate data.

## AC-10 — Scheduled nudge (Stretch, S2)

- **Given** a user with a planned session today and nudges enabled,
- **When** the scheduler runs at their configured local time,
- **Then** exactly one nudge is delivered per session per day (idempotent on
  retry);
- **And** no nudge is sent between 22:00 and 06:00 local;
- **And** after two ignored nudges, frequency drops to weekly.

## AC-11 — Mid-run memo (Stretch, S5)

- **Given** an active run session with audio consent,
- **When** a milestone trigger fires (distance or time),
- **Then** at most one memo plays per rate-limit window (default 10 min);
- **And** the user can mute mid-run memos in one tap, and the setting persists;
- **And** if the memo cannot be delivered hands-free, it is queued for the
  post-run summary rather than dropped.

## AC-12 — Healf integration (Stretch, S4)

Cannot be written yet: the API surface is unknown. Blocked on
[Q-06](open-questions.md). Placeholder criterion: *given* a documented Healf
endpoint and a sandbox credential, *then* at least one Healf-derived field visibly
changes coach output, and the coach degrades cleanly to no-Healf behaviour when the
call fails or the credential is absent.

## Cross-cutting criteria

- **No secrets in the repo.** All keys via environment variables; a
  `.env.example` lists names only.
- **Graceful third-party failure.** Every external call (LLM, TTS, Poke, Healf) has
  a timeout and a defined degraded behaviour. Killing any one dependency must not
  produce a blank screen.
- **Demo resilience.** The full demo path works with the network throttled and
  with the LLM disabled (fallbacks only). Rehearse it that way once.
