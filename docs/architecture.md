# Technical architecture and data flows

Nothing here is built yet, and no stack has been chosen. This is a proposal shaped
to be cheap to build in a hackathon window and to keep every unverified external
dependency behind an interface we control.

## Guiding constraints

1. **One deployable.** A single web service plus a managed database. No
   microservices, no queue infrastructure we have to operate.
2. **Every third party sits behind an adapter** with a defined fallback. LLM, TTS,
   Poke, and Healf are all optional at runtime.
3. **The plan is data.** LLMs produce structured objects that are validated before
   persistence; prose is rendered from data, never the source of truth.
4. **Demo-first.** Seed data and pre-generation are first-class, not an
   afterthought.

## Components

```text
┌──────────────┐        ┌─────────────────────────────────────┐
│  Poke chat   │◄──────►│  Coach API (webhook + REST)         │
│  (user)      │        │  - conversation orchestration       │
└──────────────┘        │  - plan generation / adaptation     │
                        │  - debrief generation               │
┌──────────────┐        │  - growth scoring                   │
│  Web app /   │◄──────►│  - consent enforcement              │
│  PWA         │        └───┬──────────┬──────────┬───────────┘
│ - leaderboard│            │          │          │
│ - run detail │        ┌───▼───┐  ┌───▼────┐  ┌──▼──────────┐
│ - consent    │        │  DB   │  │ Object │  │  Adapters   │
│ - audio play │        │       │  │ store  │  │  LLM / TTS  │
└──────────────┘        └───────┘  │ (audio)│  │  Poke/Healf │
                                   └────────┘  └──┬──────────┘
                                                  │
                           ┌──────────────────────┼──────────────┐
                           ▼                      ▼              ▼
                     ElevenLabs TTS        Healf API      Health store
                                          (unknown)     (HealthKit / HC)
```

### Coach API

Stateless HTTP service. Responsibilities: conversation turns, plan CRUD, run
ingestion, scoring, memo generation, consent checks. Everything else is a client.

### Scheduler

For nudges and the weekly scoring job. A single cron-style trigger hitting an
authenticated internal endpoint is enough; do not introduce a job runner.
Idempotency key = `(user_id, session_date, nudge_type)`.

### Adapters and their fallbacks

| Adapter | Primary | Fallback when unavailable |
| --- | --- | --- |
| `LlmClient` | Hosted LLM | Rules-based plan/debrief templates |
| `TtsClient` | ElevenLabs | Text-only memo; optionally browser `SpeechSynthesis` |
| `Notifier` | Poke outbound | Pull-only: web inbox + reply-on-inbound |
| `HealthSource` | Health store / file import | Manual entry form |
| `HealfClient` | Healf API (unknown) | Feature hidden entirely |

Adapter selection is env-driven so the demo can run fully offline-ish.

## Data model (proposed)

```text
user(id, display_name, created_at, tz, goal, weekly_target_runs,
     injuries_note, band)

consent(id, user_id, kind ∈ {health_read, audio_delivery, group_share},
        granted_at, revoked_at, source)

run(id, user_id, started_at, duration_s, distance_m, avg_hr, elev_gain_m,
    source ∈ {manual, import, health_store}, external_id, is_duplicate)

plan(id, user_id, week_start, generated_by ∈ {llm, rules}, created_at)
plan_session(id, plan_id, date, type, duration_min, target_effort, note,
             status ∈ {planned, done, skipped, adapted})

growth_score(id, user_id, week_start, pace_component, consistency_component,
             volume_component, adherence_component, composite, band, why)

memo(id, user_id, run_id, kind ∈ {debrief, midrun, weekly}, transcript,
     audio_url, voice_id, cache_key, created_at, delivered_at)

group(id, name, join_code)
group_member(group_id, user_id, share_scope)

message_log(id, user_id, direction, channel, body, created_at)
```

Notes:

- **Metric internally**, formatted per-user on output.
- `memo.cache_key = hash(template_id + variables + voice_id)` — the TTS cache key.
- `run.external_id` makes health-store imports idempotent.
- `growth_score` stores components separately so the `why` line and any later
  reweighting are possible without recomputation from raw runs.

## Flow 1 — Inbound coach message

```text
Poke webhook → verify signature → load user + consents
  → append to message_log
  → intent classify (onboard | adapt | question | smalltalk)
  → build context (last 3 weeks of runs, current plan, latest score)
  → LlmClient.plan_or_adapt(context)  [timeout 8s]
       ↳ validate structured output against schema
       ↳ on failure or invalid → rules fallback
  → persist plan / plan_session changes
  → render chat text from the structured plan
  → Notifier.reply(...)
```

Safety filter runs on every outbound coach message, after generation, before send.

## Flow 2 — Run lands → voice memo

```text
Run ingested (manual form | import | health store)
  → validate plausibility (AC-3) → persist run
  → mark matching plan_session done/adapted
  → recompute growth_score for the affected week
  → generate debrief transcript (LLM, else template)   [timeout 8s]
  → safety filter
  → if consent(audio_delivery):
        cache lookup by cache_key
          hit  → reuse audio_url
          miss → TtsClient.synthesize(transcript)  [timeout 10s]
                 → store audio in object store → audio_url
  → persist memo (transcript always, audio_url if available)
  → Notifier.notify(user, memo)   # link or push, depending on Q-01
```

Key property: **the transcript is persisted before TTS is attempted**, so a TTS
outage degrades to text rather than losing the memo.

## Flow 3 — Weekly scoring and leaderboard

```text
Weekly cron
  → for each user: gather runs for week, trailing 3-week baseline
  → compute 4 components, clamp each to [-1,1], weight → composite
  → assign band (getting_started if < 3 lifetime runs)
  → apply decay (0.8 × previous) if zero runs this week
  → build `why` string (≤ 80 chars)
  → persist growth_score
  → for each group: rank members by composite, generate digest
  → Notifier.digest(group)   # stretch
```

Leaderboard reads are a single indexed query on
`growth_score(week_start, composite desc)` — no on-request computation.

## Flow 4 — Mid-run memo (stretch)

```text
Client starts run session → opens lightweight channel (poll every 30s is fine)
  → client reports distance/time milestones
  → server checks rate limit + mute flag
  → returns pre-generated memo audio_url (generated at session start where
    possible, so playback is instant)
  → client plays audio  [depends on Q-05: foreground works; background unverified]
  → undeliverable memos queue onto the post-run summary
```

Pre-generating the likely mid-run memos at session start is what makes this feel
instant. Latency, not capability, is the real risk here.

## Non-functional targets (hackathon-grade)

| Concern | Target |
| --- | --- |
| Leaderboard render | < 2 s with 20 users × 6 weeks |
| Coach reply latency | < 5 s p50, < 10 s p95 |
| Memo audio start after play tap | < 1 s (cached) |
| External call timeouts | LLM 8 s, TTS 10 s, Healf 5 s |
| Retries | One retry, then fallback. No retry storms |

## Environment variables (names only, no values)

```text
DATABASE_URL
OBJECT_STORE_URL / OBJECT_STORE_KEY
LLM_API_KEY
ELEVENLABS_API_KEY          # [ASSUMPTION A-04] key-based auth
ELEVENLABS_VOICE_ID
POKE_WEBHOOK_SECRET         # [ASSUMPTION A-05] signed webhooks
POKE_API_TOKEN              # [QUESTION Q-01] outbound may not exist
HEALF_API_BASE / HEALF_API_KEY   # [QUESTION Q-06] entirely unknown
FEATURE_MIDRUN_MEMOS / FEATURE_HEALF / FEATURE_POKE_OUTBOUND
```

Every `FEATURE_*` flag defaults to off. The demo path must work with all of them
off except the ones we explicitly rehearse.
