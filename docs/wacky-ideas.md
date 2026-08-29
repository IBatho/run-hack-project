# Wacky ideas backlog (optional / stretch only)

Rules for this file:

1. **Nothing here starts before every MVP acceptance criterion passes** (D-07).
2. Each idea must be buildable in **under two hours** or it does not belong here.
3. Each must be **flag-gated and skippable** in the demo.
4. None may violate [safety, privacy, or dignity rules](permissions-privacy-safety.md).

Scored on delight (1–5) and hours. Best ratio first.

| Idea | Delight | Hours | Notes |
| --- | :-: | :-: | --- |
| **Rival ghost** — the coach voices your own past self as a rival: "your Tuesday self is 40 m ahead" | 5 | 2 | Needs no new data; pure use of existing runs. Best idea on this list |
| **Coach personas** — swap voice + tone: warm peer, Shakespearean, nature documentarian narrating your run | 5 | 1.5 | Cheap with a TTS voice switch; hilarious in a demo. Stock/licensed voices only |
| **Excuse detector** — the coach gently ranks your excuses over time: "that's the third 'busy week' this month" | 4 | 1 | Must stay affectionate, never shaming. One line, no repetition |
| **Hype intro** — a 5-second boxing-style announcer intro before your first run of the week | 4 | 1 | Pre-generated, cached, one per week |
| **Pace poetry** — post-run memo delivered as a haiku about your splits | 3 | 0.5 | Trivial prompt variant; good for a laugh mid-pitch |
| **Weather trash talk** — the coach mocks the conditions you ran in ("you ran in *that*? respect") | 3 | 1 | Needs a weather API; low risk |
| **Group boss battle** — the group's combined weekly growth depletes a shared "boss" health bar | 5 | 2+ | Genuinely motivating, but touches group state; likely over budget |
| **Streak pet** — a creature that thrives on consistency, not speed | 4 | 2 | On-thesis (relative growth!) but art assets eat the budget |
| **Confetti cannon on a personal best** — over-the-top full-screen celebration | 3 | 0.5 | Almost free; good demo punctuation |
| **Slow-clap for a slow run** — the coach *congratulates* your slowest run of the week, sincerely | 4 | 0.5 | Reinforces the thesis: easy runs are the point. Low effort, high message fit |
| **Voice memo from "future you"** — a memo framed as your self 6 weeks from now, extrapolated from your growth trend | 5 | 1.5 | On-thesis, uses the growth score, needs careful tone to avoid feeling creepy |
| **Negative split detector with a drumroll** | 2 | 0.5 | Fun, niche |

## Explicitly rejected

| Idea | Why not |
| --- | --- |
| Cloning a teammate's, judge's, or celebrity's voice for the coach | Consent and dignity. Non-negotiable (D-08) |
| Shame mode / guilt-tripping notifications | Directly contradicts the thesis and harms the primary persona |
| Auto-posting a user's runs to social media | Privacy; not our data to broadcast |
| A leaderboard that publicly names the *least* improved runner | Cruel, and exactly the dynamic we exist to remove |
| Anything reading GPS traces to make a map joke | We deliberately do not store traces (D-05) |
| Mid-run memos that cannot be muted | Trapping a voice in someone's ear is a hazard, not a gag |

## Recommended pick if there is spare time

**Rival ghost** first (2 h, delight 5, reuses existing data, and it *reinforces* the
relative-growth thesis — you race your past self, which is the entire product
argument). **Coach personas** second, as the cheapest possible laugh in the pitch.
