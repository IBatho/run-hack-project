# run-hack-project

A running coach that lives in the chat app you already use, ranks you against your own
past self rather than faster strangers, and yells at you in your ear while you run.

Concept and planning package: **[docs/README.md](docs/README.md)** (product thesis, scope,
decision matrix, open questions). Setup and deployment: **[docs/setup.md](docs/setup.md)**
and **[docs/poke-recipe.md](docs/poke-recipe.md)**.

## What it does

Runnable prototype of six hackathon features:

1. **Audio Roast Engine** — when a runner's pace drops below a configurable target, an ElevenLabs voice roast is generated and played, with a **Healf** sponsor hook woven into the copy.
2. **Ghost Pacer Bet** — a friend/group creates a stake with pace/distance targets; when a target is missed the runner's ElevenLabs "voice note of shame" is generated and pushed to the group via a **Poke** messaging webhook.
3. **Live Tracker (PWA)** — a browser page that tracks distance/pace with the **Geolocation API**, streams live pace into the roast engine, and plays roasts and cues through the **Web Audio API**. Installable to a phone home screen; no app store, no Apple Developer account.
4. **Poke AI coaching sync** — finished runs and fired roasts are pushed to Poke's documented
   inbound message API with structured run context, and Poke can read the leaderboard or log runs
   back through an MCP server exposed at `/api/poke/mcp`.
5. **Leaderboard** — completed runs (manual, **Strava** import, or the browser tracker) are ranked by distance, best pace or roasts taken, enriched with each runner's roast and bet record.

Every external provider sits behind an adapter with a local mock, so the whole flow runs end to end **with no credentials**.

## Quick start (mock mode, no keys needed)

```bash
npm install
npm run dev          # API on :8787, prototype UI on :5173
```

Open <http://localhost:5173>:

- **🔥 Audio Roast Engine** tab — tune target pace / tolerance / debounce / cooldown, hit **Run scripted demo**, and the roast audio auto-plays as the pace series crosses the threshold.
- **👻 Ghost Pacer Bet** tab — create a stake, send progress pings, then **Finish run & settle**; a missed target produces the confession audio and a Poke delivery visible in the outbox.
- **📍 Live Tracker** tab — pick a roast session, hit **Start run**, and your rolling pace is uploaded every 15s; roasts play automatically. Tick **Simulated GPS** to demo it on a desktop with no permission prompt. **Finish run** posts the run to the leaderboard as `web`.
- **🤖 Poke AI** tab — see the coaching outbox (every message and its context payload), send a
  leaderboard digest, and copy the MCP URL to register in Poke.
- **🏆 Leaderboard** tab — switch metric (distance / best pace / most roasted), log a run by hand, or **Connect** + **Sync activities** to pull runs from Strava (fixture runs in mock mode).

Headless version of the same flow (API must be running):

```bash
npm run demo
```

Other scripts: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` (then `npm start` serves the built UI from the API on :8787).

## Architecture

```
src/shared/          types + pace formatting shared by API and UI
src/server/
  config.ts          env parsing, live-vs-mock provider selection
  domain/
    roastEngine.ts   pure pace-threshold / debounce / cooldown decision logic
    betEngine.ts     pure target evaluation + miss detection
    leaderboard.ts   pure ranking of runners from activities + roasts + bets
    copy.ts          roast + confession text composition
  adapters/
    voice.ts         VoiceProvider: ElevenLabs | Mock | Fallback
    healf.ts         SponsorProvider: Healf | Mock | Fallback
    poke.ts          GroupMessenger: Poke webhook (with retries) | Mock outbox
    strava.ts        ActivityProvider: Strava OAuth + activity import | Mock fixtures
    pokeAi.ts        CoachChannel: Poke AI inbound messages (with retries) | Mock outbox
    wav.ts           offline speech-ish WAV renderer used by the mock voice
  mcp/
    pokeMcp.ts       MCP server Poke calls to read runs / log new ones
  services/          store (in-memory), audio store, roast + bet + activity orchestration
  app.ts             Express app factory (injectable config + fetch)
src/web/             React prototype UI (Vite)
src/web/tracking/    pure geo maths (`geoTrack.ts`) + Web Audio playback (`audioCues.ts`)
src/web/public/      PWA manifest, icon, app-shell service worker
scripts/demo.ts      end-to-end demo driver
tests/               vitest: domain logic, adapters, API integration
```

Rules of thumb: domain logic is pure and framework-free; every network call goes through an adapter interface; adapters degrade to mocks instead of throwing, and delivery failures are surfaced as data (`audioError`, `delivery.status`) rather than 500s.

## Configuration

Copy `.env.example` to `.env`. Nothing is required — each provider independently switches to `live` only when its credential is present, and `MOCK_MODE=1` forces mock everywhere. `GET /api/health` reports the active mode per provider (also shown as badges in the UI).

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default `8787`) |
| `PUBLIC_BASE_URL` | Base URL used to build audio clip URLs. Must be publicly reachable for Poke to attach playable audio (use an ngrok/cloudflared tunnel). |
| `MOCK_MODE` | `1` forces all providers to mock |
| `ELEVENLABS_API_KEY` | Enables live TTS |
| `ELEVENLABS_BASE_URL` / `ELEVENLABS_MODEL_ID` / `ELEVENLABS_VOICE_ID` | Endpoint, model (`eleven_turbo_v2_5`), default voice |
| `HEALF_API_KEY` / `HEALF_API_URL` / `HEALF_CAMPAIGN_ID` | Enables live sponsor hooks |
| `POKE_WEBHOOK_URL` / `POKE_API_KEY` | Enables live group delivery |
| `POKE_MAX_ATTEMPTS` | Retry budget for transient (network/5xx) webhook failures |
| `POKE_MOCK_FAIL_ATTEMPTS` | Mock only: fail N attempts to demo the error path |
| `POKE_AI_API_KEY` | Poke **V2** API key; enables live coaching sync (mock outbox without it) |
| `POKE_AI_BASE_URL` / `POKE_AI_MESSAGE_PATH` | Poke inbound endpoint (defaults `https://poke.com` + `/api/v1/inbound/api-message`) |
| `POKE_AI_MAX_ATTEMPTS` | Retry budget for transient (network/5xx) coaching sends |
| `POKE_MCP_TOKEN` | Bearer token required on `POST /api/poke/mcp`; unset means the MCP endpoint is open |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | Enables live Strava OAuth + activity import |
| `STRAVA_REFRESH_TOKEN` | Optional: start already connected after a restart |
| `STRAVA_REDIRECT_URI` | OAuth callback (default `http://localhost:8787/api/strava/callback`); host must match the app's callback domain |
| `STRAVA_SCOPE` | Requested scopes (default `read,activity:read`) |
| `STRAVA_RUNNER_NAME` | Leaderboard name for imported runs when the athlete name is unknown |
| `STRAVA_API_BASE_URL` / `STRAVA_AUTH_BASE_URL` | Endpoint overrides for tests/sandboxes |

Never commit real values; `.env` is gitignored.

### Required user-provided inputs (names only, no values)

| Feature | Input | Where it is used | How to obtain |
| --- | --- | --- | --- |
| Audio (roasts + confessions) | `ELEVENLABS_API_KEY` | `src/server/adapters/voice.ts` (`xi-api-key` header) | elevenlabs.com → Profile → API Keys |
| Audio | `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID` | same adapter; defaults ship in `config.ts` | Voice Library / model list |
| Sponsor copy | `HEALF_API_KEY`, `HEALF_API_URL`, `HEALF_CAMPAIGN_ID` | `src/server/adapters/healf.ts` | Healf; endpoint contract still unconfirmed |
| Group delivery | `POKE_WEBHOOK_URL`, `POKE_API_KEY` | `src/server/adapters/poke.ts` | Poke inbound webhook for the group chat |
| Poke AI coaching sync | `POKE_AI_API_KEY` | `src/server/adapters/pokeAi.ts` (`Authorization: Bearer`) | poke.com → Settings → Advanced → API keys (V2 key; old `pk_` keys only work on the deprecated SMS webhook) |
| Poke AI ingestion (MCP) | `POKE_MCP_TOKEN` + a public HTTPS origin | `POST /api/poke/mcp` in `src/server/app.ts` | any random string; add the URL as an MCP server in Poke |
| Group delivery | `PUBLIC_BASE_URL` | `src/server/services/audioStore.ts` clip URLs | ngrok/cloudflared tunnel so Poke can fetch audio |
| Strava tracking | `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` | `src/server/adapters/strava.ts` | strava.com/settings/api → create an API application |
| Strava tracking | `STRAVA_REDIRECT_URI` (+ matching **Authorization Callback Domain** on the Strava app) | authorize URL + `GET /api/strava/callback` | Strava app settings |
| Strava tracking | `STRAVA_REFRESH_TOKEN`, `STRAVA_RUNNER_NAME` | `ActivityService` bootstrap / activity attribution | from a completed OAuth exchange |
| Live Tracker | **No API key of any kind** — Geolocation, Web Audio and SpeechSynthesis are built into the browser | `src/web/TrackerPanel.tsx` | — |
| Live Tracker (phone) | An HTTPS origin (tunnel or deployment) — browsers only expose GPS on HTTPS or `localhost` | serving the built UI | ngrok / cloudflared / any host |

Nothing above is required to run the prototype: every provider falls back to a mock.

### ElevenLabs

Live call: `POST {ELEVENLABS_BASE_URL}/v1/text-to-speech/{voiceId}` with header `xi-api-key` and body `{ text, model_id, voice_settings }`; the audio bytes are stored in memory and served from `GET /api/audio/:id`. If a live call fails, the adapter logs and falls back to the offline WAV renderer so a demo never dies mid-run.

Setup: create a key at <https://elevenlabs.io> → Profile → API Keys, pick a voice id from the Voice Library, set `ELEVENLABS_API_KEY` (+ optional `ELEVENLABS_VOICE_ID`), restart.

### Healf sponsor hooks

Live call: `POST {HEALF_API_URL}/v1/campaigns/{HEALF_CAMPAIGN_ID}/hooks` with `Authorization: Bearer {HEALF_API_KEY}`.

Request:

```json
{
  "runner": "Isaac",
  "pace_sec_per_km": 341,
  "target_pace_sec_per_km": 300,
  "slow_by_pct": 0.137,
  "placement": "audio_roast"
}
```

Expected response (all fields optional, defaults applied):

```json
{
  "sponsor": "Healf",
  "tagline": "Healf: feel good, move better.",
  "product_plug": "Try the Healf electrolyte sachets.",
  "cta_url": "https://healf.com/collections/hydration"
}
```

Because the sponsor endpoint shape is the part most likely to differ from Healf's real API, it is isolated in `HealfSponsorProvider` — adjust the mapping there only. Without a key, curated Healf copy is used.

### Poke messaging webhook

Live call: `POST {POKE_WEBHOOK_URL}` with optional `Authorization: Bearer {POKE_API_KEY}`:

```json
{
  "group_id": "poke-group-run-club",
  "message": "🎙️ Isaac missed the Ghost Pacer Bet. Voice note of shame attached.",
  "audio_url": "https://<PUBLIC_BASE_URL>/api/audio/<clip>.wav",
  "source": "run-hack-project",
  "metadata": {
    "bet_id": "…",
    "runner": "Isaac",
    "dare": "…",
    "stake": "…",
    "missed_targets": [{ "id": "…", "label": "Average pace under 5:10/km", "shortfall": 28 }],
    "confession_text": "…"
  }
}
```

Network errors and 5xx are retried up to `POKE_MAX_ATTEMPTS`; 4xx is not retried. Either way a delivery record (`delivered`/`failed`, attempts, error) is returned and shown in the UI outbox — nothing throws. In mock mode deliveries land in the in-memory outbox at `GET /api/poke/outbox`.

### Poke AI coaching sync (outbound)

Poke's only documented programmatic ingress is `POST https://poke.com/api/v1/inbound/api-message`
([docs](https://poke.com/docs/api)) with a bearer V2 API key and an arbitrary JSON body, where
`message` is the instruction the agent acts on and the rest of the body reaches it as context.
Nothing beyond that is assumed. Sent automatically when a run is recorded (`POST /api/activities`,
including browser-tracked runs) and when the roast engine fires, plus on demand from the 🤖 Poke AI
tab (`POST /api/poke/digest`):

```json
{
  "message": "Isaac just finished a 10.20km run at 5:00/km. Review it against their recent runs and reply with one specific coaching cue for the next session.",
  "source": "run-hack-project",
  "event": "run_completed",
  "runner": "Isaac",
  "context": {
    "activity": { "id": "…", "source": "web", "distance_km": 10.2, "duration_sec": 3060, "avg_pace_sec_per_km": 300, "started_at": "…" },
    "recent_runs": [{ "distance_km": 8.1, "avg_pace_sec_per_km": 312, "source": "strava", "started_at": "…" }],
    "leaderboard": { "rank": 1, "total_distance_km": 42.3, "avg_pace_sec_per_km": 305, "roast_count": 4 }
  }
}
```

`event` is `run_completed`, `roast_fired` or `digest`. Network errors and 5xx retry up to
`POKE_AI_MAX_ATTEMPTS`; 4xx (bad key/payload) does not retry. Failures are recorded, never thrown —
the run is still saved. Without `POKE_AI_API_KEY` the mock channel records the identical message
locally, so the whole flow is demoable with no credentials; `GET /api/poke/status` returns the mode,
endpoint, counters and outbox.

### Poke AI ingestion (MCP server)

Poke reads data from third-party services by calling an MCP server
([docs](https://poke.com/docs/mcp-servers)), so ingestion is served at `POST /api/poke/mcp` over
JSON-RPC 2.0 (`initialize`, `ping`, `tools/list`, `tools/call`). Tools:

| Tool | Arguments | Returns |
| --- | --- | --- |
| `get_leaderboard` | `metric` (`distance\|pace\|roasts`), `days` | ranked entries |
| `list_recent_runs` | `runnerName`, `limit` (≤50) | completed runs, newest first |
| `get_runner_summary` | `runnerName` (required) | totals + that runner's last 10 runs |
| `log_run` | `runnerName`, `distanceKm`, `durationSec` (required), `name`, `startedAt` | the created activity (`source: "poke"`) |

Runs logged through MCP do **not** trigger an outbound coaching message, so Poke cannot loop back on
itself. Set `POKE_MCP_TOKEN` and register `https://<your-host>/api/poke/mcp` in Poke; requests must
then send `Authorization: Bearer <POKE_MCP_TOKEN>` or get a 401. The endpoint needs a public HTTPS
origin (tunnel or deployment) before Poke can reach it — that is the only blocker to a live
end-to-end ingestion test.

## API

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/health` | provider modes |
| `GET`/`POST` | `/api/sessions` | list / create runner sessions |
| `GET`/`PATCH` | `/api/sessions/:id` | detail (samples, roasts, threshold) / reconfigure |
| `POST` | `/api/sessions/:id/samples` | ingest a pace sample → decision + optional roast |
| `POST` | `/api/sessions/:id/roasts` | manual roast, optional custom `text` |
| `GET` | `/api/audio/:id` | generated audio bytes |
| `GET`/`POST` | `/api/bets` | list / create stakes |
| `GET` | `/api/bets/:id` | bet detail |
| `POST` | `/api/bets/:id/progress` | progress snapshot; `final: true` settles and triggers the confession |
| `GET` | `/api/poke/outbox` | delivery log |
| `GET` | `/api/leaderboard` | ranked runners; `?metric=distance\|pace\|roasts`, `?days=N` window |
| `GET`/`POST` | `/api/activities` | list / log a completed run |
| `GET` | `/api/poke/status` | Poke AI mode, endpoint, MCP path, counters + coaching outbox |
| `POST` | `/api/poke/digest` | send a leaderboard digest; optional `runnerName` |
| `POST` | `/api/poke/mcp` | MCP JSON-RPC endpoint for Poke (bearer token if `POKE_MCP_TOKEN` is set) |
| `GET` | `/api/strava/status` | provider mode, connection state, authorize URL |
| `POST` | `/api/strava/connect` | exchange an authorization `code` for tokens |
| `GET` | `/api/strava/callback` | OAuth redirect target (same exchange, `?code=`) |
| `POST` | `/api/strava/sync` | import activities; de-duplicated by Strava activity id |
| `POST` | `/api/demo/reset` | reseed demo data |

### Sample requests

```bash
# 1. Configure the seeded session's threshold (5:00/km target, 5% tolerance)
SESSION=$(curl -s localhost:8787/api/sessions | python3 -c 'import json,sys;print(json.load(sys.stdin)["sessions"][0]["id"])')
curl -s -X PATCH localhost:8787/api/sessions/$SESSION -H 'content-type: application/json' \
  -d '{"targetPaceSecPerKm":300,"tolerancePct":0.05,"debounceSamples":2,"cooldownSec":0}'

# 2. Two slow samples: the first debounces, the second fires the roast + audio
curl -s -X POST localhost:8787/api/sessions/$SESSION/samples -H 'content-type: application/json' \
  -d '{"paceSecPerKm":341,"distanceKm":3}'
curl -s -X POST localhost:8787/api/sessions/$SESSION/samples -H 'content-type: application/json' \
  -d '{"paceSecPerKm":352,"distanceKm":4}'

# 3. Settle a bet with a missed target -> confession voice note + Poke delivery
BET=$(curl -s localhost:8787/api/bets | python3 -c 'import json,sys;print(json.load(sys.stdin)["bets"][0]["id"])')
curl -s -X POST localhost:8787/api/bets/$BET/progress -H 'content-type: application/json' \
  -d '{"distanceKm":8.4,"avgPaceSecPerKm":338,"elapsedSec":2839,"final":true}'
curl -s localhost:8787/api/poke/outbox
```

### Strava tracking

Standard authorization-code flow: `GET /api/strava/status` returns the authorize URL, the
redirect lands on `GET /api/strava/callback?code=…`, and `POST /api/strava/sync` reads
`GET /api/v3/athlete/activities`. Only running activities are kept; distance/moving time are
converted to sec/km (`average_speed` in m/s is the fallback) so the rest of the app keeps
speaking pace. Imports are de-duplicated by Strava activity id, so syncing twice is safe.
Tokens are held in memory and refreshed on expiry; `STRAVA_REFRESH_TOKEN` seeds a connected
account at boot. Without credentials the mock provider serves three fixture runs.

## Live Tracker (browser GPS + Web Audio)

`navigator.geolocation.watchPosition` feeds fixes into `src/web/tracking/geoTrack.ts`, which is
pure and unit-tested: haversine distance, fixes worse than 50m accuracy discarded, sub-2m jitter
ignored, and pace derived from a 45s rolling window rather than `coords.speed` (null on most
desktops, jittery on phones).

Pace maths, in one place (all state in SI-ish units: km, seconds, sec/km, epoch ms):

- **Rolling pace** = seconds elapsed ÷ km covered across the oldest fix at-or-before the 45s
  window boundary, so the window length is stable instead of collapsing to the last GPS interval.
- **Average pace** = whole-run elapsed seconds ÷ total km, reported separately in the UI.
- Fixes are dropped when the timestamp is duplicate or out of order (zero/negative deltas never
  reach a division), when latitude/longitude/accuracy are non-finite or out of range, or when the
  implied speed exceeds 12 m/s (a GPS jump). Dropped fixes are counted and shown.
- Sub-2m movement does not advance the distance anchor, so standing still decays rolling pace to
  `—` after a full window rather than reporting a fake pace.

Every 15s the rolling pace is POSTed to
`/api/sessions/:id/samples`, so the existing threshold/debounce/cooldown engine decides when a
roast fires — the tracker adds no roast logic of its own.

Audio goes through one `AudioContext` created inside the Start click handler (mobile browsers
mute audio started anywhere else): roast WAVs are fetched and played with `decodeAudioData`,
short oscillator cues mark start/finish/slowdown, and `speechSynthesis` reads the roast aloud if
the clip is missing. **Finish run** posts the run to `/api/activities` with `source: 'web'`.

### Running and testing it (5 minutes)

1. `npm run dev`, open <http://localhost:5173> → **📍 Live Tracker**.
2. Desktop, no permissions: tick **Simulated GPS**, set a pace slower than the session target
   (e.g. `6:30`), **Start run**. Distance/pace tick up, roasts appear and play within ~15s of
   simulated time; **Finish run** then shows the run on the 🏆 Leaderboard tagged `web`.
3. Real GPS on a phone: the page must be on **HTTPS** (or `localhost`) — `npm run build && npm start`,
   expose :8787 with `ngrok http 8787`, open the https URL, **Allow** the location prompt, then
   *Add to Home Screen* to install the PWA.

### Browser requirements

- **Secure context**: Geolocation is only available on HTTPS or `localhost`; the panel detects
  `window.isSecureContext` and says so instead of failing silently.
- **Location permission**: prompted on first Start; if denied the panel explains how to recover
  and simulated GPS still works.
- **Audio autoplay**: the AudioContext is unlocked by the Start click; audio may stay silent if
  the run is started programmatically or the device is on silent (iOS honours the ringer switch).
- **Foreground tab**: browsers throttle timers and GPS in background tabs, so keep the screen on.
  This is the main functional gap vs. a native app.

## Tracking approach: browser PWA + Strava (native app dropped)

The leaderboard needs a real source of distance/speed. Three options were weighed:

- **Browser Geolocation PWA (implemented).** Live pace during the run — enough to drive roasts —
  with zero credentials, zero app-store review, and no Apple Developer account. It runs on the
  same TypeScript/React stack as the rest of the app and is testable in minutes. Cost: no reliable
  background tracking, and the screen must stay awake.
- **Strava import (implemented).** Best fidelity for completed runs and inherits everything the
  user already records on a watch, but activities only exist post-run, so it cannot roast live.
- **Native Swift app (dropped).** Would give background GPS, but needs macOS + Xcode, an Apple
  Developer team, signing and entitlements, plus review before anyone else can run it — far too
  much overhead for a prototype, so the earlier Swift sources were removed.

The two implemented paths are complementary: the PWA roasts you mid-run, Strava backfills runs
tracked elsewhere, and both land in the same leaderboard.

Follow-ups: persist activities and Strava tokens (currently in-memory), a Wake Lock + offline
sample queue so a backgrounded tab does not lose data, Strava webhooks instead of manual sync,
and per-user identity so imported activities map to real accounts.

## Trigger semantics

- **Roast**: fires when pace > `target × (1 + tolerance)` for `debounceSamples` consecutive samples, and only if `cooldownSec` has elapsed since the last roast. Returning inside target resets the debounce so the next slowdown is a fresh crossing.
- **Bet**: unmet targets are only `atRisk` while the run is live (a runner can still recover average pace or add distance). The `final` snapshot settles the bet `won`/`missed`; `missed` is what triggers the confession + Poke send.

## Switching mock → live

1. Put the relevant keys in `.env` (each provider flips independently).
2. Set `PUBLIC_BASE_URL` to a publicly reachable URL if Poke must fetch the audio.
3. Ensure `MOCK_MODE` is unset/`0`, restart, and confirm `GET /api/health` shows `live` for the providers you expect.

## Status & limitations

The tracker was verified with simulated GPS in a desktop browser; real-device GPS accuracy and
background behaviour are untested. State is in-memory (restart or `POST /api/demo/reset` clears it) — the store and audio store are deliberately narrow interfaces to swap for Postgres/S3. The Healf and Poke request/response shapes are best-effort prototypes and may need adjusting to the real sponsor/webhook contracts; both are one-file changes inside `src/server/adapters/`.
