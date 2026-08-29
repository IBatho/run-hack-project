# Prioritized decision matrix

## Scoring method

Each candidate is scored 1–5 on four axes, then ranked by:

```text
priority = (demo_impact * 2) + thesis_fit + feasibility - risk
```

- **Demo impact** — how much a judge feels it in 3 minutes. Double-weighted,
  because a hackathon is judged on the demo.
- **Thesis fit** — does it prove one of the three bets in
  [product thesis](product-thesis.md)?
- **Feasibility** — 5 = a few hours, 1 = a day-plus or blocked on unknowns.
- **Risk** — dependency on unverified third parties or platform behaviour;
  subtracted.

Max score 25.

## The matrix

| Candidate | Impact | Thesis | Feas. | Risk | Score | Verdict |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Relative-growth score + leaderboard | 5 | 5 | 4 | 1 | **18** | **MVP — do first** |
| Post-run voice memo (TTS + transcript) | 5 | 5 | 4 | 2 | **17** | **MVP** |
| Coach adaptation from free text | 4 | 5 | 4 | 1 | **16** | **MVP** |
| Onboarding → structured plan | 3 | 4 | 5 | 1 | **14** | **MVP** |
| Seeded demo data that tells a story | 4 | 1 | 5 | 1 | **13** | **MVP — do early** |
| Run ingestion (manual/import) | 2 | 3 | 5 | 1 | **11** | **MVP (enabler)** |
| Consent + "what the coach knows" screen | 2 | 2 | 4 | 1 | **9** | **MVP (small, high credibility)** |
| Poke as the live coach surface | 5 | 5 | 2 | 4 | **13** | Stretch — attempt after MVP |
| Scheduled outbound nudges | 3 | 3 | 3 | 4 | **8** | Stretch |
| Mid-run voice memos | 5 | 4 | 2 | 5 | **11** | Stretch — demo only if device-tested |
| Health store auto-import | 2 | 2 | 2 | 3 | **5** | Stretch — skip unless time is abundant |
| Healf integration | 3 | 2 | 1 | 5 | **4** | Stretch — 60-min timebox, else a slide |
| Background/notification auto-play audio | 5 | 3 | 1 | 5 | **9** | Stretch — do not promise |
| Voice input (talk back mid-run) | 4 | 2 | 1 | 4 | **7** | Stretch — classic time sink |
| Multi-week periodized plans | 1 | 2 | 3 | 1 | **8** | Skip for hackathon |
| Wacky features (any) | 3 | 1 | 3 | 2 | **8** | Optional, only post-MVP |

## Reading the matrix

**Build order:** growth score → leaderboard → coach plan/adapt → debrief text →
TTS memo → consent → seed data. Then, and only then, Poke and stretch items.

**Highest impact-per-hour:** the voice memo. One adapter plus a cache, and the
product stops looking like a CRUD app.

**Highest risk-to-reward trap:** background hands-free audio (score 9, risk 5). It
is the coolest thing in the plan and the most likely to burn six hours and not
work. Verify on a real device in under 30 minutes, or drop it.

**Most defensible cut:** Healf. Scored 4 — lowest on the board, purely because the
API surface is unknown. Cutting it costs us little in demo terms as long as we
present it as designed-for and flag-gated.

**Do not skip despite low thesis fit:** seed data (13). A great leaderboard with
boring data proves nothing; the whole visual argument lives in the seed.

## Standing decisions

| ID | Decision | Rationale | Revisit if |
| --- | --- | --- | --- |
| D-01 | Web/PWA is the demo surface; Poke is a stretch channel | Poke capabilities unverified (**Q-01**) | Q-01 answered early and favourably |
| D-02 | Plans are structured data; prose is rendered | Testability, consistency across surfaces | Never |
| D-03 | Safety enforced by a deterministic filter, not prompts | Prompt-only safety is not safety | Never |
| D-04 | Transcript always shown with every memo | Accessibility + audio fallback | Never |
| D-05 | No GPS traces stored in v1 | Not needed; most sensitive data we could hold | A feature genuinely requires routes |
| D-06 | Healf timeboxed to 60 minutes of discovery | Unknown API, high risk | Sponsor confirms a usable API |
| D-07 | Wacky features only after MVP acceptance criteria pass | Protects the demo | Never |
| D-08 | No voice cloning of real people, ever | Consent and dignity | Never |
