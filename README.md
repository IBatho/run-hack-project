# run-hack-project

Runnable prototype of two hackathon features:

1. **Audio Roast Engine** — when a runner's pace drops below a configurable target, an ElevenLabs voice roast is generated and played, with a **Healf** sponsor hook woven into the copy.
2. **Ghost Pacer Bet** — a friend/group creates a stake with pace/distance targets; when a target is missed the runner's ElevenLabs "voice note of shame" is generated and pushed to the group via a **Poke** messaging webhook.

Every external provider sits behind an adapter with a local mock, so the whole flow runs end to end **with no credentials**.

## Quick start (mock mode, no keys needed)

```bash
npm install
npm run dev          # API on :8787, prototype UI on :5173
```

Open <http://localhost:5173>:

- **🔥 Audio Roast Engine** tab — tune target pace / tolerance / debounce / cooldown, hit **Run scripted demo**, and the roast audio auto-plays as the pace series crosses the threshold.
- **👻 Ghost Pacer Bet** tab — create a stake, send progress pings, then **Finish run & settle**; a missed target produces the confession audio and a Poke delivery visible in the outbox.

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
    copy.ts          roast + confession text composition
  adapters/
    voice.ts         VoiceProvider: ElevenLabs | Mock | Fallback
    healf.ts         SponsorProvider: Healf | Mock | Fallback
    poke.ts          GroupMessenger: Poke webhook (with retries) | Mock outbox
    wav.ts           offline speech-ish WAV renderer used by the mock voice
  services/          store (in-memory), audio store, roast + bet orchestration
  app.ts             Express app factory (injectable config + fetch)
src/web/             React prototype UI (Vite)
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

Never commit real values; `.env` is gitignored.

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

## Trigger semantics

- **Roast**: fires when pace > `target × (1 + tolerance)` for `debounceSamples` consecutive samples, and only if `cooldownSec` has elapsed since the last roast. Returning inside target resets the debounce so the next slowdown is a fresh crossing.
- **Bet**: unmet targets are only `atRisk` while the run is live (a runner can still recover average pace or add distance). The `final` snapshot settles the bet `won`/`missed`; `missed` is what triggers the confession + Poke send.

## Switching mock → live

1. Put the relevant keys in `.env` (each provider flips independently).
2. Set `PUBLIC_BASE_URL` to a publicly reachable URL if Poke must fetch the audio.
3. Ensure `MOCK_MODE` is unset/`0`, restart, and confirm `GET /api/health` shows `live` for the providers you expect.

## Status & limitations

State is in-memory (restart or `POST /api/demo/reset` clears it) — the store and audio store are deliberately narrow interfaces to swap for Postgres/S3. The Healf and Poke request/response shapes are best-effort prototypes and may need adjusting to the real sponsor/webhook contracts; both are one-file changes inside `src/server/adapters/`.
