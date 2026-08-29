# Product thesis

## One sentence

A running coach that lives in the messaging app you already use, judges you only
against your own past self, and talks to you in your ear while you run.

## The problem

Running apps optimize for the wrong comparison. Leaderboards rank absolute
performance, so the fastest person wins every week and everyone else learns that
they are losing. For a beginner, a Strava segment leaderboard is a demotivation
engine. Meanwhile coaching is either free-and-generic (a static 12-week PDF plan)
or good-and-expensive (a human coach at £100+/month).

Three specific failure modes we target:

1. **Absolute leaderboards punish beginners.** The person who improved their 5k by
   90 seconds this week is invisible next to a club runner who was always fast.
2. **Coaching feedback arrives at the wrong time.** Post-run screens are read
   hours later, if at all. The moment feedback matters is mid-run and immediately
   after.
3. **Another app is a tax.** Installing, onboarding, and remembering to open a
   fifth fitness app is friction most casual runners never pay.

## The bet

Three bets, each independently testable during the hackathon:

- **Bet 1 — Conversational surface beats an app surface.** Coaching delivered
  through a chat assistant (Poke) has materially lower friction than a dedicated
  app, because the user never installs or opens anything new.
- **Bet 2 — Relative growth is the motivating metric.** Ranking *improvement rate*
  rather than raw pace makes a leaderboard something a beginner wants to look at.
- **Bet 3 — Voice closes the loop.** A short, personal, spoken message in your
  headphones is remembered far better than a push notification with text.

## Why now

- Cheap, fast, good text-to-speech makes per-user personalized audio viable at
  hackathon budgets (see [sponsor integrations](sponsor-integrations.md)).
- LLMs make plan adaptation from free-text context ("knee felt off today")
  tractable without a rules engine.
- Wearable and phone health stores (Apple HealthKit, Google Health Connect)
  expose workout data with user consent, so we do not need our own tracker.

## What "good" looks like at the end of the hackathon

A judge can, in three minutes:

1. Send a chat message to the coach and get a plan adapted to their stated state.
2. Complete (or simulate) a run and receive a spoken coach memo in headphones.
3. See a leaderboard where a slow-but-improving runner ranks above a fast-but-flat
   one, and understand instantly why.

## Non-goals

Explicitly out of scope, and we should say so out loud in the demo:

- Building our own GPS tracking or activity-recording engine.
- Medical, injury-diagnosis, nutrition-prescription, or rehab advice.
- Multi-sport support (cycling, swimming, gym). Running only.
- Account systems with password reset, billing, team admin, or org hierarchy.
- Native app store distribution. Web + chat surface only.
- Anti-cheat robustness beyond obvious sanity checks.

## Positioning against what exists

| Product | Comparison model | Coaching | Surface |
| --- | --- | --- | --- |
| Strava | Absolute segments, social | Minimal | App |
| Runna / generic plan apps | Plan adherence | Templated plan | App |
| Human coach | Personal, contextual | Excellent | WhatsApp / calls |
| **This project** | **Relative growth vs your past self** | **LLM + context, mid-run voice** | **Chat + voice** |

Nothing in the table is a market claim we can defend to a judge as researched;
it is our working mental model. **[ASSUMPTION A-01]**
