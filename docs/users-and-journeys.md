# Target users and journeys

## Primary persona — "Returning Rachel"

- 29, ran a bit at university, has run 3 times in the last 6 weeks.
- Owns a phone and cheap wireless earbuds. No sports watch.
- Wants: to feel like she is getting better, and not to feel slow.
- Fails at: consistency, and reading a training plan she does not understand.
- Uses chat apps constantly; installs a new app roughly never.

**What she needs from us:** a nudge that knows her history, a run that feels
achievable today, and proof she is improving.

## Secondary persona — "Consistent Sam"

- 34, runs 3–4x/week, has a Garmin, tracks everything.
- Wants: structure and a reason to push, plus something social that is not
  a pace-flex contest with people who are simply faster.
- Risk to us: he is the person who *wins* absolute leaderboards, so relative
  growth ranking can feel unfair to him. Our leaderboard must still respect
  high-volume consistency (see the leaderboard design in
  [feature concepts](feature-concepts.md)).

## Tertiary persona — "Team captain Tolu"

- Organizes the office running group of 8–20 people via a group chat.
- Wants: something that keeps the group engaged for a whole month.
- Is our distribution channel: one captain brings the whole group.

## Anti-persona

Competitive club athletes chasing a marathon PB with a real coach and a
periodized plan. We will lose to their coach and we should not try to serve them.

## Journey 1 — Onboarding (target: under 3 minutes)

1. Rachel messages the coach in Poke: "I want to start running again."
2. Coach asks 4 questions, one at a time: goal, current weekly runs, any injuries,
   preferred days.
3. Coach asks for permission to read her run history and to send her voice memos.
   Each permission is a separate, explicit ask with a stated reason.
4. Coach produces a 1-week plan (3 runs) and confirms it in chat.
5. Coach schedules the first nudge.

**Failure paths:** she declines health-data access (fall back to self-reported
runs, typed into chat); she declines audio (fall back to text memos); she stops
answering mid-onboarding (persist partial answers, resume on next message).

## Journey 2 — Run day

1. Morning: short chat nudge — "Easy 25 min today. Reply 'swap' to move it."
2. She replies "knee is a bit sore".
3. Coach adapts: 20 min easy or a rest day, states why in one sentence, does not
   diagnose, and surfaces the safety line from
   [permissions, privacy, safety](permissions-privacy-safety.md).
4. She starts a run. Her workout is recorded by whatever she already uses.
5. Mid-run (stretch): at a milestone, a spoken memo plays in her headphones.
6. Post-run: within ~2 minutes of the workout landing, she gets a voice memo:
   what went well, one thing to work on, and her growth delta.

## Journey 3 — Weekly review and leaderboard

1. Sunday evening: coach posts her week — runs completed, growth score, trend.
2. She sees the group leaderboard ranked by relative growth with her at #2, above
   two people who are objectively faster than her.
3. The leaderboard shows *why* she ranks there: "+8% pace at equal effort,
   3/3 runs completed".
4. Coach proposes next week's plan; she confirms or asks for a change in chat.

## Journey 4 — Group / captain

1. Tolu creates a group and shares a join link in the office chat.
2. Members join; each consents individually to what they share with the group.
3. Weekly digest posts to the group: biggest improver, most consistent, a
   collective total.
4. Only aggregate and opt-in fields are group-visible — never raw GPS traces,
   never health metrics.

## Journey 5 — Lapse and recovery

1. Rachel misses two consecutive runs.
2. Coach sends one low-guilt message, not three: "Life happens. Want a 15-minute
   reset run or a fresh week?"
3. Her growth score decays gracefully rather than resetting to zero, so returning
   is cheap. Decay behaviour is defined in [feature concepts](feature-concepts.md).
4. If she does not reply within a week, nudges drop to weekly. No streak-shaming.
