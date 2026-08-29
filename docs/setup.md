# Setup, keys and deployment

Everything needed to go from a fresh clone to a live deployment. Companion doc:
[Poke Recipe integration](poke-recipe.md).

The app runs **end to end with no credentials** — every provider falls back to a local mock — so
add keys only for the integrations you actually want live.

## 1. Local run (no keys)

```bash
git clone https://github.com/IBatho/run-hack-project.git
cd run-hack-project
npm ci                 # Node >= 20
cp .env.example .env    # optional; an empty file is valid
npm run dev             # API on :8787, UI on :5173
```

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (then `npm start` serves
the built UI from the API on `:8787`).

`GET /api/health` reports which providers are `live` vs `mock` — the fastest way to confirm a key
was picked up.

## 2. Environment variables

Full annotated list: [`.env.example`](../.env.example). Only the first column is ever secret.

| Variable | Secret | Needed for |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | yes | real generated voice instead of the offline WAV renderer |
| `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID` | no | which voice/model roasts use |
| `ELEVENLABS_DRILL_VOICE_ID` | no | separate, harder-edged voice for drill mode |
| `COACH_DEFAULT_MODE` | no | `roast` (default) or `drill` for new sessions |
| `POKE_AI_API_KEY` | yes | outbound coaching messages to Poke |
| `POKE_MCP_TOKEN` | yes | bearer token Poke must present to call our MCP server *and* `POST /api/poke/commands` |
| `POKE_WEBHOOK_URL`, `POKE_API_KEY` | yes | Ghost Pacer Bet confession delivery to a group chat |
| `HEALF_API_KEY`, `HEALF_API_URL`, `HEALF_CAMPAIGN_ID` | key only | live sponsor hooks |
| `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN` | yes | Strava import |
| `STRAVA_CLIENT_ID`, `STRAVA_REDIRECT_URI`, `STRAVA_SCOPE` | no | Strava OAuth wiring |
| `PUBLIC_BASE_URL` | no | public URLs for audio clips Poke must fetch |
| `PORT`, `MOCK_MODE` | no | port; force every provider to mock |

### Secure handling rules

- `.env`, `.env.local` and `dist/` are git-ignored. **Never** commit a filled-in `.env`; add new
  variables to `.env.example` with an empty value and a comment instead.
- All secrets are read **server-side only**, in `src/server/config.ts`. Nothing secret is exposed
  to the browser: the Vite bundle only ever talks to our own `/api/*` routes, and no variable is
  prefixed `VITE_`. Do not introduce `VITE_`-prefixed secrets — Vite inlines those into public JS.
- `/api/health` and `/api/poke/status` report *modes* and endpoints, never key material.
- Rotate by replacing the value in your host's secret store and redeploying; keys are only held in
  process memory.
- Give each environment (local / preview / production) its own key, so a leaked preview key can be
  revoked without downtime.
- If a key does leak: revoke it at the provider first (ElevenLabs → Profile → API Keys,
  Poke → Settings → Advanced, Strava → API application), then issue a new one.

## 3. ElevenLabs (voice)

1. Create an account at <https://elevenlabs.io>, then **Profile → API Keys → Create**.
2. Pick a voice in the [Voice Library](https://elevenlabs.io/app/voice-library) and copy its voice
   id. Optionally pick a second, more aggressive voice for drill mode.
3. Set in `.env` (or your host's secret store):

   ```bash
   ELEVENLABS_API_KEY=sk_...            # never commit
   ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb
   ELEVENLABS_DRILL_VOICE_ID=           # optional
   ELEVENLABS_MODEL_ID=eleven_turbo_v2_5
   ```

4. Restart and confirm `GET /api/health` shows `elevenlabs: "live"`, then hit **🪖 Drill me now**
   in the 🔥 Audio Roast Engine tab.

The adapter calls `POST /v1/text-to-speech/{voiceId}` with `xi-api-key` and per-mode
`voice_settings` (drill lowers `stability` and raises `style` for a shoutier read). Any live
failure logs and falls back to the offline renderer, so a demo never dies mid-run.

## 4. Vercel (hosting)

Poke's MCP server and audio attachments both need a **public HTTPS origin**; Vercel is the quickest
way to get one. Node ≥ 20 runtime.

The repo ships the config: [`vercel.json`](../vercel.json) (build command, `dist/web` as the static
output, and an `/api/*` rewrite) and [`api/index.ts`](../api/index.ts), a serverless entry that
exports the same Express app as the local server.

1. Push the repo to GitHub, then <https://vercel.com/new> → **Import** `IBatho/run-hack-project`.
   Framework preset **Other**; the committed `vercel.json` supplies build/install/output settings.
2. **Project → Settings → Environment Variables**: add each secret from the table above, scoped
   per environment (Production / Preview / Development). Vercel encrypts them at rest and injects
   them at runtime; they are never in the repo.
3. Set `PUBLIC_BASE_URL` to the deployment URL (e.g. `https://run-hack-project.vercel.app`) so
   generated audio clip URLs are fetchable by Poke.
4. Redeploy after any variable change (env vars are read at boot), then check
   `https://<your-app>.vercel.app/api/health`.

Preview deployments get their own URL — useful for registering a throwaway MCP endpoint in Poke
while testing, with a separate `POKE_MCP_TOKEN`.

**Serverless caveat:** sessions, roasts and audio clips are held in process memory, so they are not
shared between invocations and audio URLs can 404 on a different instance. For anything past a
short demo either wire the Supabase stores below, or run the server as a long-running service
(Render / Fly / Railway: `npm ci && npm run build`, start `npm start`) and point the UI at it.

## 5. Supabase (persistence)

State currently lives in memory (`src/server/services/store.ts`, `audioStore.ts`), so a restart or
`POST /api/demo/reset` clears it. Supabase is the intended durable backing store; the two stores
are deliberately narrow interfaces to swap out. **This wiring is not implemented yet** — the steps
below are the setup path plus the schema the current types imply.

1. Create a project at <https://supabase.com/dashboard> → **New project** (note the region and the
   database password; the password is a secret).
2. **Project Settings → API** gives you:
   - Project URL → `SUPABASE_URL` (not secret)
   - `anon` key → only for browser clients with row-level security; this app does not need it
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**highly** secret: bypasses RLS, server-side
     only, never in a `VITE_` variable or client bundle)
3. **Project Settings → Database → Connection string** gives `DATABASE_URL` if you prefer talking
   SQL directly over the REST API.
4. Store those in `.env` locally and in Vercel's environment variables for deployments.
5. Schema to create in the SQL editor (mirrors `src/shared/types.ts`):

   ```sql
   create table run_sessions (
     id text primary key,
     runner_name text not null,
     target_pace_sec_per_km int not null,
     tolerance_pct numeric not null,
     debounce_samples int not null,
     cooldown_sec int not null,
     voice_id text not null,
     coach_mode text not null default 'roast' check (coach_mode in ('roast', 'drill')),
     created_at timestamptz not null default now()
   );

   create table pace_samples (
     id bigserial primary key,
     session_id text not null references run_sessions(id) on delete cascade,
     pace_sec_per_km int not null,
     distance_km numeric,
     recorded_at timestamptz not null default now()
   );

   create table roasts (
     id text primary key,
     session_id text not null references run_sessions(id) on delete cascade,
     text text not null,
     coach_mode text not null check (coach_mode in ('roast', 'drill')),
     audio_id text,
     sponsor text,
     created_at timestamptz not null default now()
   );

   create table activities (
     id text primary key,
     runner_name text not null,
     source text not null,
     external_id text,
     distance_km numeric not null,
     duration_sec int not null,
     avg_pace_sec_per_km int not null,
     started_at timestamptz not null,
     unique (source, external_id)
   );

   create table bets (
     id text primary key,
     runner_name text not null,
     stake text,
     dare text,
     status text not null,
     targets jsonb not null,
     created_at timestamptz not null default now()
   );
   ```

6. Audio clips belong in **Storage** rather than a table: create a bucket (e.g. `roast-audio`),
   keep it private, and hand Poke a signed URL instead of a public one so clips expire.

Keep the `unique (source, external_id)` constraint — it is what makes repeated Strava syncs
idempotent, which the in-memory store does by hand today.

## 6. Strava (optional)

1. <https://www.strava.com/settings/api> → create an API application. The **Authorization Callback
   Domain** must match the host of `STRAVA_REDIRECT_URI`.
2. Set `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` / `STRAVA_REDIRECT_URI`, restart, then use
   **Connect** in the 🏆 Leaderboard tab and **Sync activities**. A `STRAVA_REFRESH_TOKEN` makes
   the server boot already connected.

## 7. Going live checklist

- [ ] Keys set in the host's secret store (not in the repo)
- [ ] `PUBLIC_BASE_URL` = the deployed HTTPS origin
- [ ] `MOCK_MODE` unset or `0`
- [ ] `GET /api/health` shows `live` for the providers you expect
- [ ] `POKE_MCP_TOKEN` set **before** registering the MCP URL in Poke
- [ ] A drill-mode roast plays end to end from the UI
- [ ] "start my run" in Poke returns a `?command=` link, and one tap in the browser flips the
      command to `armed` (see [poke-recipe.md](poke-recipe.md#d-start-my-run-from-the-chat))
