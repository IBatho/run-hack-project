# Open questions

Blocking or near-blocking unknowns. Each has an ID referenced elsewhere in the
docs, an owner slot, and a "why it matters". Answer them and edit this file in
place — a stale question costs a teammate an hour.

## Blocking — answer in hour 0–1

| ID | Question | Ask | Why it matters | Owner |
| --- | --- | --- | --- | --- |
| Q-01 | Can a Poke assistant send **unprompted outbound** messages to a user (e.g. on a schedule), or only reply to inbound messages? | Poke docs / staff | Decides whether nudges are push or pull — a core product behaviour (S1, S2) | `@owner-sponsors` |
| Q-02 | Can a Poke assistant message a **group**, or arbitrary other people, or only the user in the conversation? | Poke docs / staff | Decides whether the group digest is a Poke feature or a web page (S8) | `@owner-sponsors` |
| Q-06 | Does Healf expose a partner/public API usable in a hackathon? Where are the docs? | Healf booth / docs | Gates all of S4. 60-minute timebox (D-06) | `@owner-sponsors` |
| Q-13 | Is there a sponsor-provided ElevenLabs hackathon key, and what are its limits? | Sponsor booth | Gates the entire voice track (M4) | `@owner-sponsors` |
| Q-16 | What is the actual build window, team size, and submission deadline? | Organizers | Every timeline in [milestones](milestones-and-ownership.md) assumes 24–36 h (A-13) | `@owner-demo` |

## Important — answer before the dependent milestone

| ID | Question | Ask | Why it matters | Owner |
| --- | --- | --- | --- | --- |
| Q-03 | Does ElevenLabs offer streaming synthesis, and what is time-to-first-audio for ~50 words? | Docs + test | Determines whether mid-run memos need full pre-generation (S5) | `@owner-sponsors` |
| Q-04 | What are the rate limits / character quotas, and what happens on exhaustion? | Docs | Demo-day risk; sets the per-user memo cap | `@owner-sponsors` |
| Q-05 | Can audio play **hands-free from a background notification** on our target platform, and under which permission? Do "spoken notification" features give us anything we can rely on? | Platform docs + real device test | Decides whether the headline mid-run feature is demoable or must be presented as designed-only | `@owner-frontend` |
| Q-07 | Healf auth model — API key, or OAuth on behalf of a user? Sandbox available? | Healf | OAuth would likely push S4 out of scope entirely | `@owner-sponsors` |
| Q-08 | Which Healf data categories are available, at what granularity, with what consent flow? | Healf | Determines whether Healf can inform coaching at all | `@owner-sponsors` |
| Q-10 | How are Poke inbound webhooks authenticated, and what is the payload shape? | Poke docs | Needed to build the coach endpoint securely (A-05) | `@owner-backend` |
| Q-11 | Which TTS output formats play reliably in a mobile browser? | Docs + device test | A silent demo is the failure mode | `@owner-frontend` |
| Q-17 | Which LLM provider and model do we use, and do we have credits? | Team decision | Gates M3 | `@owner-ai` |
| Q-18 | Where do we deploy, and do we have an account ready? | Team decision | M0 requires a live URL in hour 1 | `@owner-backend` |

## Design decisions we owe ourselves

| ID | Question | Considerations | Owner |
| --- | --- | --- | --- |
| Q-09 | On health-consent revocation, do we **delete** imported data or merely **detach** it? | Deletion is cleaner and easier to defend; detaching preserves historical growth scores. Leaning delete, with scores retained as derived aggregates | `@owner-backend` |
| Q-19 | Are growth scores comparable across users at all, or only within a group? | Cross-user comparison is the leaderboard's whole premise but is the weakest part of the metric. Within-group only is more honest | `@owner-data` |
| Q-20 | Should a rest day the coach *recommended* count as adherence? | Yes, we think — otherwise the coach is punished for keeping the user healthy | `@owner-ai` |
| Q-21 | Do we show absolute pace anywhere on the leaderboard? | Showing it invites the comparison we are trying to defuse; hiding it looks evasive. Leaning: available on a personal page, not on the group board | `@owner-frontend` |
| Q-22 | Default memo voice and tone — warm peer, or drill sergeant? | Warm peer as default; a tone toggle is a cheap delight feature | `@owner-ai` |

## Compliance and eligibility

| ID | Question | Owner |
| --- | --- | --- |
| Q-14 | Are there brand/usage requirements for sponsor-prize eligibility (logo, mention, specific API usage)? | `@owner-sponsors` |
| Q-15 | Is there a named sponsor contact or booth for Healf and ElevenLabs? (Usually the fastest path to Q-03–Q-08 by an order of magnitude) | `@owner-sponsors` |
| Q-23 | Are we allowed to demo with seeded data, and must we disclose it? | `@owner-demo` |
| Q-24 | Does the submission require an open-source licence or a specific repo structure? | `@owner-demo` |

## Answered

Move rows here with the answer and its source as they are resolved. Two are already
settled from this repository's own tooling context:

| ID | Question | Answer | Source |
| --- | --- | --- | --- |
| Q-25 | Can an agent working in this repo message arbitrary teammates in-app (e.g. via Poke)? | **No.** No Poke integration and no MCP servers are configured for this organization; Slack and Microsoft Teams are also not installed. There is no available in-app teammate-messaging mechanism today | Organization integration list inspected during planning |
| Q-26 | What agent→teammate channels *do* work for this repo? | **GitHub only:** pushing branches, opening PRs, and posting PR comments, which reach teammates through their own GitHub notification settings (in-app and/or email). This is not general in-app messaging, and it cannot target someone who is not on the PR | GitHub integration verified installed and exercised on this repo |
