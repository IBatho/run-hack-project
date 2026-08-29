# Sponsor integration hypotheses and risks

**Read this first:** no API detail in this document is verified. We have not read
ElevenLabs' or Healf's documentation as part of writing this plan, and we have not
made a single call to either. Every endpoint, parameter, auth mechanism, latency
figure, quota, and pricing statement below is either an explicit assumption or an
explicit question. **Do not copy anything here into code as if it were a spec.**
Step one for whoever owns each integration is to read the vendor's own docs and
replace the guesses with facts.

---

## ElevenLabs — coach voice

### Why we want it

Voice is our differentiator. A short, warm, spoken memo in someone's headphones is
the thing a judge remembers. It is also, we believe, the highest
impact-per-engineering-hour item in the whole project: one adapter, one cache, and
the product changes character.

### Integration hypothesis

We expect to need, at minimum:

- A way to authenticate (**[ASSUMPTION A-04]**: an API key in a header).
- A way to list or select a voice, referenced by some stable identifier
  (**[ASSUMPTION A-09]**).
- A text-to-speech call that accepts text and returns audio bytes or a URL
  (**[ASSUMPTION A-10]**).
- Optionally, streaming synthesis for lower time-to-first-audio
  (**[QUESTION Q-03]**).

Our `TtsClient` adapter is defined around exactly that shape:

```text
TtsClient.synthesize(text, voice_id) -> audio_bytes | url
TtsClient.available() -> bool
```

If the real API differs, only the adapter changes.

### Questions to validate before building

- **[Q-03]** Is there a streaming endpoint, and what is realistic
  time-to-first-audio for ~50 words?
- **[Q-04]** What are the hackathon-tier rate limits and character quotas, and what
  happens when we exceed them — hard error or throttle?
- **[Q-11]** Which output formats are available, and which of them play reliably
  in a mobile browser?
- **[Q-12]** Are there terms restricting voice usage, redistribution, or retention
  of submitted text?
- **[Q-13]** Is there a sponsor-provided hackathon key, and what are its limits?

### Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Quota exhausted during demo | Fatal on stage | Aggressive cache; pre-generate all demo memos; never synthesize live in the demo path |
| Latency too high for mid-run | S5 feels broken | Pre-generate at run start; fall back to post-run |
| Key not issued in time | No voice at all | Browser `SpeechSynthesis` as an ugly-but-working fallback |
| Audio format unplayable on the demo phone | Silent demo | Test on the actual demo device in hour 1 |
| Cost overrun from a generation loop | Wasted quota | Hard per-user daily memo cap; cache on `template + variables + voice` |

### Judge-facing angle

"Personalized coaching audio, generated per run, cached so it costs almost nothing,
with a transcript for accessibility." That is a defensible, non-gimmicky use of a
voice sponsor.

---

## Healf — health and wellness context

### What we actually know

Effectively nothing, from the perspective of this plan. We do not know Healf's
data model, whether it exposes a public API, what auth model it uses, whether
sandbox credentials exist for hackathon participants, or what data a user could
consent to share. Writing anything more specific would be inventing it.

### Hypotheses about the value (not the API)

Ranked by how plausible and how useful each would be:

1. **Recovery/readiness context** — if Healf can surface sleep or recovery signal,
   the coach could scale today's session to it. Highest coaching value.
2. **Wellness goals** — align coach tone and plan with a goal the user already set
   elsewhere. Medium value, low complexity.
3. **Product/nutrition context** — a genuinely useful "fuel this long run" nudge,
   but it slides toward nutrition advice, which our
   [safety rules](permissions-privacy-safety.md) prohibit. Handle as
   information, never prescription.
4. **Identity/profile** — least interesting; not worth an integration.

### Questions to validate

- **[Q-06]** Does Healf expose a partner/public API for hackathon use? Where are
  the docs?
- **[Q-07]** What auth model — API key, OAuth on behalf of a user, or something
  else? If OAuth, is there a sandbox tenant?
- **[Q-08]** What data categories are available, at what granularity, and with what
  user consent flow?
- **[Q-14]** Are there brand or usage requirements for sponsor-prize eligibility?
- **[Q-15]** Is there a sponsor contact or booth we can ask directly? (Usually the
  fastest path by an order of magnitude.)

### Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| No usable API exists | S4 dead | Keep Healf entirely behind a feature flag; product works without it |
| OAuth flow too slow to build | Half-finished integration | Prefer a read-only key path; if OAuth is required, deprioritize below all MVP work |
| We guess the API and build the wrong thing | Wasted hours + embarrassment | **Hard rule: no Healf code until a real doc page or contact confirms the shape** |
| Data implies medical advice | Safety violation | Route all Healf-derived output through the same safety filter |
| Sponsor-prize criteria unmet | Lost prize | Ask at the booth in hour 1; note criteria in [open questions](open-questions.md) |

### Decision rule

Timebox Healf discovery to **60 minutes** at the start. If, after 60 minutes, we do
not have documentation or a sponsor contact confirming a usable API, Healf becomes
a slide in the pitch ("designed-for, flag-gated, adapter ready") rather than code.
That is an honest and defensible position, and far better than a broken
integration.

---

## Poke — the coach's surface

Not framed as a sponsor here, but it carries the same class of unknown, and it is
more load-bearing than either sponsor integration.

- **[Q-01]** Can an assistant/agent send *unprompted* outbound messages to a user
  on a schedule, or only reply to inbound messages?
- **[Q-02]** Can it message a *group*, or arbitrary other people — or only the user
  who is talking to it?
- **[Q-10]** How are inbound webhooks authenticated, and what is the message
  payload shape?

The answer to Q-01 decides whether "nudges" are push or pull, and the answer to
Q-02 decides whether the group digest is a Poke feature or a web page. Both are
handled behind the `Notifier` interface so either answer is survivable
(see [architecture](architecture.md)).

Note: the prototype on `main` has since built against Poke's documented inbound
message API plus an MCP server for reads — see the Poke sections of the root
[README](../README.md) for the shapes it actually uses. Treat that code, not this
doc, as the record of Poke's real surface.

### What we verified about agent-to-teammate messaging

Checked in this repository's own tooling context, and reported precisely because it
is easy to overclaim:

- **[VERIFIED]** The GitHub integration is installed and working for this repo: an
  agent can push branches, open pull requests, and post PR comments. Those comments
  notify GitHub users subscribed to the PR via GitHub's own notification settings.
- **[VERIFIED]** No Poke integration or Poke MCP server is present in this
  organization's integration list, and no MCP servers are configured at all. There
  is therefore **no available mechanism today for an agent in this repo to send an
  in-app Poke message to an arbitrary teammate.**
- **[VERIFIED]** Slack and Microsoft Teams integrations are **not** installed
  either, so chat-based teammate messaging is not available through them right now.
- **[NOT VERIFIED]** Whether Poke itself, as a product, supports agent-initiated
  messages to arbitrary users. That is a question for Poke's own docs
  (**[Q-01]**, **[Q-02]**), not something this repo's context can answer. The
  prototype's Poke adapters send to a *configured* endpoint/group, which is not
  the same capability as addressing an arbitrary teammate.

Practical consequence for the team: **PR comments and email-style GitHub
notifications are the reliable channel; general in-app teammate messaging is not
available.** Do not design a workflow that depends on the agent DMing teammates.
