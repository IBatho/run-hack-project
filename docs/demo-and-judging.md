# Demo and judging narrative

## The 3-minute script

Timings are targets; rehearse to them. Presenter is `@owner-demo`.

### 0:00–0:20 — The hook (no slides, no app)

> "Leaderboards tell most runners they're losing. Here's the fastest person in our
> office group — and here's someone who took 90 seconds off her 5k this month.
> Guess which one quit."

One sentence of problem, one concrete contrast. No product yet.

### 0:20–0:50 — The coach adapts

Live: type into the coach — **"knee's a bit sore today"**.

Show: today's session changes from *easy 25 min* to *20 min easy* (or rest), one
sentence of reasoning, and the not-a-doctor line.

Say: *"The plan is structured data, not a chat transcript — so everything else in
the product stays consistent with it. And that safety line isn't a prompt; it's an
enforced filter."*

### 0:50–1:35 — The voice memo (the emotional beat)

Live: press play on the latest run's memo. **Audio out loud, in the room.**

> "Nice work — 4.2k in 26 minutes, your steadiest pace yet at the same heart rate.
> Next run, try starting 20 seconds slower per km. You're up 8% this month."

Show: the transcript on screen beside it.

Say: *"Generated per run, cached so repeats cost nothing, always with a transcript
for accessibility. On a real run this lands in your headphones minutes after you
stop."*

Have this audio pre-generated. Do not synthesize live on stage.

### 1:35–2:20 — The relative-growth leaderboard (the intellectual beat)

Show: the group leaderboard. Point at row 1 and row 4.

Say: *"She's a minute per kilometre slower than him — and she's ranked above him,
because she's improving faster and she's shown up three times out of three. Every
row explains itself."*

Then flip to the absolute-pace ordering for one second and flip back.

Say: *"Same data, two stories. One of them makes people keep running."*

Address the objection before a judge raises it: *"And yes — for the runners already
near their ceiling, consistency is weighted in, and there's a separate consistency
board."*

### 2:20–2:45 — Honesty and depth

Show: the "what the coach knows about me" screen.

Say: *"Three separate consents. No GPS traces stored. Group visibility is an
allowlist. Mid-run hands-free audio is designed and flag-gated — we haven't
validated background playback on every platform, so we're not claiming it."*

Naming an unvalidated limit is a credibility multiplier with technical judges, and
it pre-empts the question that would otherwise wrong-foot us.

### 2:45–3:00 — Close

> "A coach in the chat app you already use, that judges you only against your past
> self, and talks to you in your ear. Relative growth, live. Voice, live."

## Judging-criteria mapping

Typical rubric axes, and our strongest evidence for each:

| Axis | Our evidence |
| --- | --- |
| Innovation | Relative-growth ranking as the *primary* metric, not a side stat |
| Technical execution | Structured LLM output + validation, deterministic safety filter, cached TTS, adapter fallbacks |
| Design / UX | Chat-native coaching; memo + transcript; self-explaining leaderboard rows |
| Impact | Directly targets beginner dropout — the largest, least-served running cohort |
| Sponsor use (ElevenLabs) | Voice is core to the product, not decoration; cached and capped |
| Sponsor use (Healf) | Designed-for, adapter-ready, flag-gated — presented honestly if not wired |
| Completeness | Deployed URL, seeded data, works with the LLM disabled |

## Anticipated questions and answers

**"Can't people game the growth score?"**
Yes, somewhat. Mitigations: newcomers are in a separate band until 3 runs,
components are clamped, plausibility checks reject impossible runs, and consistency
is weighted in. We are not claiming anti-cheat robustness at hackathon scale.

**"What about fast runners? This punishes them."**
Real tension, acknowledged. Consistency is 25% of the score, and there is a
separate consistency board. Longer term, growth relative to a personal ceiling
model.

**"Does the voice memo actually reach headphones during a run?"**
Foreground playback: yes, demonstrated. Hands-free background playback: designed,
flag-gated, not validated across platforms — so we do not claim it. Undeliverable
memos queue to the post-run summary.

**"Is this medical advice?"**
No, and it is enforced rather than requested: a deterministic filter blocks
diagnosis and treatment language, caps volume progression, and escalates red-flag
symptoms to a fixed non-generated response.

**"Why Poke rather than your own app?"**
Distribution. The lowest-friction coach is one in a chat app the user already
opens. Our web surface is the fallback, and the messaging layer is behind one
interface either way.

**"What would you build next?"**
Health-store auto-import, real mid-run milestone memos, and group challenges — in
that order.

## Demo logistics checklist

- [ ] Deployed URL loaded in a tab **before** we walk up; do not deploy live.
- [ ] Demo phone charged, on wifi, volume at ~70%, do-not-disturb on.
- [ ] **Speaker audio tested in the actual room.** The single most common demo
      failure is inaudible audio.
- [ ] All demo memos pre-generated and cached.
- [ ] Seed data reset to the exact known-good state.
- [ ] Backup video ready on a local file, not streamed.
- [ ] Notifications and Slack quit on the presenting machine.
- [ ] One person on the keyboard, one narrating. Never both.
- [ ] Rehearsed twice, including once with the network throttled.
