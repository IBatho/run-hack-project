# Permissions, privacy, and safety

This project touches health data, a person's location history, audio played into
their ears, and advice about their body. Each of those deserves care even in a
hackathon, and judges reliably ask about it.

## Permission inventory

| Permission | Why we need it | When we ask | Fallback if denied | Status |
| --- | --- | --- | --- | --- |
| Read run history (health store) | Growth score, debriefs | After onboarding, in context | Manual run entry in chat/web | **[ASSUMPTION A-06]** |
| Audio delivery / playback | Voice memos | Before the first memo | Text transcript only | **[VERIFIED in principle]** for foreground playback; see below |
| Notifications | Nudges, memo delivery | Before first nudge | In-app inbox / pull-only | **[ASSUMPTION A-07]** |
| Background audio / auto-play | Hands-free mid-run memos | Only if we build S5 | Queue for post-run | **[QUESTION Q-05]** unverified |
| Group sharing | Leaderboard visibility | On joining a group | Solo mode, no leaderboard | Our own design |
| Healf data access | Recovery/wellness context | Only if S4 is built | Feature hidden | **[QUESTION Q-06]** unknown |

### What we can and cannot state about audio

- **Foreground audio playback after a user gesture** is standard web/app behaviour
  and safe to rely on for the demo. **[ASSUMPTION A-03]** — trivially verifiable
  in the first hour of building; do that before designing around it.
- **Hands-free playback from a background notification** is the interesting
  version and is *not* something we have verified on any platform. Browsers block
  autoplay without a gesture, and mobile OSes constrain background audio. Some
  platforms offer user-enabled "announce notifications" accessibility features,
  but those are the *user's* setting — we cannot grant them, detect them
  reliably, or promise them to a judge. **[QUESTION Q-05]**

Rule for the team: **never demo a capability we have not run on a real device.**
If mid-run hands-free audio does not work on the demo phone, we say "queued to
post-run" and move on.

## Consent design

- **Granular.** Health read, audio delivery, and group sharing are three separate
  consents, stored as separate rows with timestamps
  (see the `consent` table in [architecture](architecture.md)).
- **Contextual.** Ask at the moment of use with a one-line reason, not in a wall of
  checkboxes at signup.
- **Revocable in one action**, with immediate effect enforced server-side, not
  merely hidden in the UI.
- **Legible.** A "what the coach knows about me" screen listing every stored field
  and where it came from. Cheap to build, disproportionately convincing.

## Data minimization

- Store **aggregates, not traces**: distance, duration, average HR, elevation gain.
  No GPS polylines in v1 — we do not need them and they are the most sensitive
  thing in the dataset.
- **Group-visible fields are an allowlist**: display name, growth composite, the
  `why` line, sessions completed. Never raw HR, never pace history, never location.
- **Retention:** hackathon data is disposable. Say so in the UI and delete the demo
  database after judging.
- **No PII in prompts** beyond a display name and the numbers required for
  coaching. Do not send email addresses or identifiers to the LLM or TTS provider.
- **No health data in logs.** Log identifiers and outcomes, not values.

## Third-party data flow disclosure

Users should be told, in plain words, what leaves the device:

- Run summaries and coaching context → LLM provider (for text generation).
- Memo *text* → ElevenLabs (for audio). No health numbers should appear in the
  memo text beyond what the user already sees on screen.
- Nothing → Healf unless the user explicitly connects it.

**[ASSUMPTION A-08]** Third-party providers may retain request content for some
period. We have not checked ElevenLabs' or any LLM provider's retention terms.
Do not claim "your data is never stored by third parties" in the demo.

## Coaching safety

The coach talks to people about their bodies. Hard rules:

**The coach must never:**

- Name a medical condition, or suggest the user has one.
- Prescribe treatment, medication, supplements, or rehab protocols.
- Tell a user to push through pain.
- Increase weekly volume beyond a configured cap (default: +10% per week, and
  never more than +1 session per week).
- Schedule sessions on consecutive days for a user reporting fewer than 3
  runs/week.

**The coach must always:**

- Recommend rest when the user reports pain, illness, or dizziness.
- Include the standing line: *"I'm a coach, not a doctor — for pain that persists,
  please see a professional."*
- Escalate red-flag language (chest pain, fainting, severe breathlessness, numbness)
  to a fixed, non-generated response advising urgent medical attention, **without**
  adapting the training plan and **without** LLM improvisation.

**Enforcement:** a deterministic post-generation filter, not a prompt instruction.
Prompt-only safety is not safety. The filter checks for prohibited patterns and
required elements, and replaces the message with a safe template on violation. This
is testable — see [AC-2](acceptance-criteria.md).

## Voice-specific safety and dignity

- **Silenceable, always.** One tap to mute, and the setting persists.
- **Rate-limited.** Default one memo per 10 minutes mid-run.
- **Volume-respectful.** Never override the device volume or ducking behaviour.
- **No shaming tone.** Missed runs get one low-guilt message, never repeated
  guilt. Tone rules belong in the prompt *and* in reviewed copy templates.
- **Consented voice only.** Use a licensed/stock voice from the provider. Do not
  clone a teammate's, a judge's, or a celebrity's voice — even as a joke, even for
  a "wacky" feature. This is the one wacky idea we should refuse outright.

## Security basics

- Verify webhook signatures on the Poke endpoint. **[ASSUMPTION A-05]**
- Secrets via environment variables only; `.env.example` carries names, never
  values.
- Audio object URLs should be unguessable and expiring, not sequential IDs — a
  memo transcript is personal.
- No admin surface, no impersonation, no debug endpoint that dumps user data. If
  we build a seed/reset endpoint, it must require a secret and be disabled by
  default.

## Accessibility

- Every memo has a visible transcript, always on screen — not behind a toggle.
- Leaderboard information is never conveyed by colour alone.
- All interactive controls keyboard-reachable; audio player has a real label.
