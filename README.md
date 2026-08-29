# run-hack-project

Runnable prototype of two hackathon features:

1. **Audio Roast Engine** — when a runner's pace drops below a configurable target, an ElevenLabs voice roast is generated and played, with a **Healf** sponsor hook woven into the copy.
2. **Ghost Pacer Bet** — a friend/group creates a stake with pace/distance targets; when a target is missed the runner's ElevenLabs "voice note of shame" is generated and pushed to the group via a **Poke** messaging webhook.
3. **Leaderboard** — completed runs (manual, **Strava** import, or the iOS tracker) are ranked by distance, best pace or roasts taken, enriched with each runner's roast and bet record.

Every external provider sits behind an adapter with a local mock, so the whole flow runs end to end **with no credentials**.

## Quick start (mock mode, no keys needed)

```bash
npm install
npm run dev          # API on :8787, prototype UI on :5173
```

Open <http://localhost:5173>:

- **🔥 Audio Roast Engine** tab — tune target pace / tolerance / debounce / cooldown, hit **Run scripted demo**, and the roast audio auto-plays as the pace series crosses the threshold.
- **👻 Ghost Pacer Bet** tab — create a stake, send progress pings, then **Finish run & settle**; a missed target produces the confession audio and a Poke delivery visible in the outbox.
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
    wav.ts           offline speech-ish WAV renderer used by the mock voice
  services/          store (in-memory), audio store, roast + bet + activity orchestration
  app.ts             Express app factory (injectable config + fetch)
src/web/             React prototype UI (Vite)
ios/RunHackTracker/  SwiftUI + CoreLocation tracker prototype (source only, never compiled)
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
| Group delivery | `PUBLIC_BASE_URL` | `src/server/services/audioStore.ts` clip URLs | ngrok/cloudflared tunnel so Poke can fetch audio |
| Strava tracking | `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` | `src/server/adapters/strava.ts` | strava.com/settings/api → create an API application |
| Strava tracking | `STRAVA_REDIRECT_URI` (+ matching **Authorization Callback Domain** on the Strava app) | authorize URL + `GET /api/strava/callback` | Strava app settings |
| Strava tracking | `STRAVA_REFRESH_TOKEN`, `STRAVA_RUNNER_NAME` | `ActivityService` bootstrap / activity attribution | from a completed OAuth exchange |
| iOS tracker | Apple Developer account + Team ID, bundle identifier, provisioning/signing | Xcode target | developer.apple.com |
| iOS tracker | Background Modes capability (*Location updates*, *Audio*), `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSAppTransportSecurity` local-networking exception | Info.plist + Signing & Capabilities | Xcode |
| iOS tracker | Reachable API base URL (LAN IP or tunnel) | `RunHackTrackerApp.apiBaseURL` | your dev machine |

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

## Tracking approach: Strava now, Swift later

The leaderboard needs a real source of distance/speed. Two options were considered:

- **Strava integration (implemented, runnable).** Pure TypeScript inside the existing adapter
  pattern, testable with an injected `fetch`, mockable end to end, and it inherits every run a
  user already records with a watch or phone. Cost: activities appear post-run, so it feeds the
  leaderboard but cannot drive live roasts.
- **Native Swift tracker (prototyped, not built).** The only way to get live location/pace for
  in-run roasting, but it needs macOS + Xcode, an Apple Developer team, device signing and
  background-location entitlements — none of which exist in this environment, so nothing could
  be compiled or verified. The sources in `ios/RunHackTracker/` are a head start, not an app.

So Strava is the working prototype and the Swift app is the follow-up: finish it on a Mac to
unlock live roasting, and keep Strava as the backfill for runs tracked on other devices.
Follow-ups: persist activities and Strava tokens (currently in-memory), add Strava webhook
push instead of manual sync, per-user identity so imported activities map to real accounts,
and an offline sample queue in the iOS app.

## Trigger semantics

- **Roast**: fires when pace > `target × (1 + tolerance)` for `debounceSamples` consecutive samples, and only if `cooldownSec` has elapsed since the last roast. Returning inside target resets the debounce so the next slowdown is a fresh crossing.
- **Bet**: unmet targets are only `atRisk` while the run is live (a runner can still recover average pace or add distance). The `final` snapshot settles the bet `won`/`missed`; `missed` is what triggers the confession + Poke send.

## Switching mock → live

1. Put the relevant keys in `.env` (each provider flips independently).
2. Set `PUBLIC_BASE_URL` to a publicly reachable URL if Poke must fetch the audio.
3. Ensure `MOCK_MODE` is unset/`0`, restart, and confirm `GET /api/health` shows `live` for the providers you expect.

## Status & limitations

The iOS tracker has never been compiled (no Xcode on this machine) — see `ios/RunHackTracker/README.md`.
State is in-memory (restart or `POST /api/demo/reset` clears it) — the store and audio store are deliberately narrow interfaces to swap for Postgres/S3. The Healf and Poke request/response shapes are best-effort prototypes and may need adjusting to the real sponsor/webhook contracts; both are one-file changes inside `src/server/adapters/`.
