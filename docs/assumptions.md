# Assumptions register

Every load-bearing belief in this plan that we have **not** verified. If you build
on one of these, verify it first and update the row. A cheap verification done in
hour 1 is worth more than a clever design built on a guess.

| ID | Assumption | Confidence | Impact if false | How to verify | Owner |
| --- | --- | --- | --- | --- | --- |
| A-01 | Our competitor mental model (Strava et al. rank absolutely and coach minimally) is broadly accurate | Medium | Weakens the positioning claim in the pitch; not a build risk | 20 min looking at the actual apps | `@owner-demo` |
| A-02 | Pace adjusted for distance and elevation is an acceptable proxy for effort when heart rate is missing | Low | Growth scores become noisy and unfair; the leaderboard's credibility drops | Compute both on seeded HR-bearing runs and compare rank order | `@owner-data` |
| A-03 | Audio plays reliably in the foreground after a user tap on the demo device/browser | High | The core demo beat fails | Play any audio file after a tap on the demo phone — 10 minutes | `@owner-frontend` |
| A-04 | ElevenLabs authenticates via an API key sent in a header | High | Adapter auth rewrite; small | Read ElevenLabs' own docs | `@owner-sponsors` |
| A-05 | Poke inbound webhooks are signed and verifiable | Medium | Either an unauthenticated endpoint (unacceptable) or a different auth scheme | Read Poke's integration docs | `@owner-sponsors` |
| A-06 | A phone health store (HealthKit / Health Connect) can export run summaries with user consent, in a form we can import | Medium | Auto-import (S3) dies; manual entry still covers the demo | Read platform docs; try one export | `@owner-backend` |
| A-07 | Standard push/notification permissions are obtainable on our chosen surface | Medium | Nudges become pull-only | Request the permission on the demo device | `@owner-frontend` |
| A-08 | Third parties (LLM, TTS) may retain submitted content for some period | Medium | We would be wrong to claim "never stored"; adjust demo language only | Read the providers' terms | `@owner-sponsors` |
| A-09 | ElevenLabs voices are addressable by a stable identifier we can pin | High | Voice may change between runs; cosmetic | Docs + one call | `@owner-sponsors` |
| A-10 | An ElevenLabs TTS call accepts text and returns audio bytes or a URL | High | Adapter shape changes | Docs + one call | `@owner-sponsors` |
| A-11 | ~50-word memos synthesize fast enough (< ~3 s) to feel instant when cached-miss | Medium | Mid-run memos need pre-generation (already the plan) | Time 10 real calls | `@owner-sponsors` |
| A-12 | A hosted LLM can reliably emit our plan schema with validation + one retry | Medium | Fall back to rules-based generation more often than expected | 20 generations, count schema failures | `@owner-ai` |
| A-13 | A 24–36 hour window with 3–4 people is the actual budget | Medium | Whole timeline shifts; cut list applies earlier | Read the hackathon rules | `@owner-demo` |
| A-14 | Judges reward honest limitation-naming over overclaiming | Medium | Only affects pitch framing | Read the judging rubric if published | `@owner-demo` |
| A-15 | Seeded data is acceptable in the demo if disclosed | High | We would need live data capture during judging | Ask the organizers | `@owner-demo` |
| A-16 | Growth weights (0.45 / 0.25 / 0.20 / 0.10) produce an intuitive ranking | Low | Rankings feel arbitrary; retune against seed data | Sanity-check the ordering against human intuition on seed users | `@owner-data` |

## Verification priority

Do these four in the first hour; they gate everything else:

1. **A-03** — foreground audio on the demo device. Ten minutes, unblocks the whole
   voice track.
2. **A-04 / A-10** — one successful ElevenLabs call. Confirms the sponsor path.
3. **A-13** — the real time budget. Determines whether we are already cutting.
4. **A-12** — LLM structured-output reliability. Determines how much the
   rules-based fallback has to carry.

## How to update this file

When an assumption is resolved, change the row to `**[VERIFIED]**` or
`**[FALSE]**`, name the source in the row, and — if false — open a corresponding
entry in [open questions](open-questions.md) describing the consequence. Do not
delete rows; the history of what we believed is useful in the write-up.
