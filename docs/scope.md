# Scope: MVP vs stretch

Assumed hackathon window: **~24–36 build hours, 3–4 people.** If the real window
is shorter, cut from the bottom of the MVP table upward and say so in the demo.

## MVP — must all be true for a working demo

| # | Item | Owner slot | Depends on |
| - | --- | --- | --- |
| M1 | Data model + storage for users, runs, plans, memos | `@owner-backend` | — |
| M2 | Run ingestion (one path: manual/self-reported or file import) | `@owner-backend` | M1 |
| M3 | Growth score v1 computed and stored per user per week | `@owner-data` | M1, M2 |
| M4 | Group leaderboard view, growth-ranked, with a "why" line per row | `@owner-frontend` | M3 |
| M5 | Coach conversation: onboarding → structured 1-week plan | `@owner-ai` | M1 |
| M6 | Coach adaptation from free-text context ("sore knee", "only 20 min") | `@owner-ai` | M5 |
| M7 | Post-run text debrief generated from a real run record | `@owner-ai` | M2, M3 |
| M8 | TTS of the debrief, playable in-app with a visible transcript | `@owner-frontend` | M7, ElevenLabs key |
| M9 | Consent screen gating health-data read and audio delivery | `@owner-frontend` | M1 |
| M10 | Seeded demo data (4–6 users, 6 weeks of runs) that makes the leaderboard tell a story | `@owner-data` | M1 |

**MVP definition of done:** every criterion in
[acceptance criteria](acceptance-criteria.md) marked MVP passes, on a deployed URL,
with seeded data, without a developer in the loop.

## Stretch — build only after MVP is green

| # | Item | Why it is stretch |
| - | --- | --- |
| S1 | Real Poke channel as the primary coach surface | Depends on unverified Poke capabilities (**Q-01**, **Q-02**) |
| S2 | Scheduled outbound nudges | Same dependency; needs a scheduler |
| S3 | Health store integration (HealthKit / Health Connect) for automatic run import | Platform setup cost is high; manual import covers the demo |
| S4 | Healf integration | API surface entirely unknown (**Q-06**) |
| S5 | Mid-run voice memos triggered at distance/time milestones | Needs a live run session and background delivery (**Q-05**) |
| S6 | Background/notification audio auto-play | Most likely to be platform-blocked |
| S7 | Multi-week periodized plans with deload | Not needed to demo the thesis |
| S8 | Group creation, join links, weekly group digest | Seeded groups suffice for the demo |
| S9 | Voice *input* — talk back to the coach mid-run | Cool, deep; classic hackathon time sink |
| S10 | Any item from [wacky ideas](wacky-ideas.md) | Delight, not thesis |

## Explicitly not in scope

- Auth beyond a demo-grade magic link or a hardcoded session.
- Payments, subscriptions, quotas.
- Real-time GPS tracking implemented by us.
- Native iOS/Android apps submitted to stores.
- Injury diagnosis, medical guidance, nutrition prescription.
- Migrations, multi-region, observability stack, load testing.

## Cut order under time pressure

Cut in this order, and keep the demo coherent at every step:

1. S* items (all stretch) — drop silently.
2. M9 consent UI → replace with a static consent copy block plus a checkbox.
3. M4 leaderboard interactivity → static ranked table.
4. M8 live TTS → pre-rendered audio files for the demo users (still honest, if we
   say the generation path is wired but pre-baked for demo reliability).
5. M6 adaptation → 3 hardcoded adaptation cases.

**Never cut:** M3 (growth score) and M7/M8's *transcript* — those two are the
thesis. A demo without relative growth or without a coach voice is a different,
less interesting project.

## Time budget sketch

| Phase | Hours | Content |
| --- | --- | --- |
| Setup | 0–3 | Repo scaffold, deploy target, keys, data model |
| Core | 3–14 | M1–M7 |
| Voice | 14–20 | M8, transcript, caching |
| Polish | 20–27 | M9, M10, leaderboard "why" lines, empty states |
| Demo | 27–32 | Script, rehearse twice, record a backup video |
| Buffer | 32–36 | Everything that went wrong |

Freeze features at the start of the Demo phase. Two rehearsals, minimum, and a
recorded backup so a live failure does not cost us the pitch.
