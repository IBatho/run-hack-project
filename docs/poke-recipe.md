# Poke Recipe integration, end to end

How a runner goes from "never heard of this" to "Poke coaches me after every run", and how we
package that as a shareable **Poke Recipe**. Key/deployment details live in [setup.md](setup.md).

Sources: Poke [Recipes](https://poke.com/docs/recipes), [MCP servers](https://poke.com/docs/mcp-servers),
[API](https://poke.com/docs/api). A recipe bundles onboarding context, a prefilled first message and
the required integrations (MCP templates), and publishes to a `https://poke.com/r/<slug>` install
link — so a runner installs one link instead of pasting a URL and a token by hand.

## The two directions of traffic

| Direction | Transport | Ours | Poke's |
| --- | --- | --- | --- |
| **App → Poke** (push) | `POST https://poke.com/api/v1/inbound/api-message` with `Authorization: Bearer $POKE_AI_API_KEY` | `src/server/adapters/pokeAi.ts` | processes the `message` as an instruction, with the rest of the body as context |
| **Poke → app** (pull/write) | MCP JSON-RPC 2.0 at `POST {PUBLIC_BASE_URL}/api/poke/mcp`, bearer `$POKE_MCP_TOKEN` | `src/server/mcp/pokeMcp.ts` | calls `tools/list` then `tools/call` during conversations |

Push happens automatically when a run is recorded (`run_completed`), when the roast engine fires
(`roast_fired`), and on demand from the 🤖 Poke AI tab (`digest`). Pull is Poke asking us
questions — leaderboard, recent runs, runner summary — or logging a run it heard about in chat.

MCP tools exposed (full argument table in the [README](../README.md#poke-ai-ingestion-mcp-server)):
`get_leaderboard`, `list_recent_runs`, `get_runner_summary`, `log_run`. Runs logged via MCP do not
trigger an outbound message, so Poke cannot loop back on itself.

Poke sends `X-Poke-User-Id` on every MCP request — the hook for per-runner scoping once accounts
exist (today all data is shared; see [Multi-runner scoping](#multi-runner-scoping)).

## A. Publish the recipe (owner, once)

1. **Get a public HTTPS origin** for the API — deploy per [setup.md](setup.md#4-vercel-hosting), or
   tunnel a local server: `npx poke@latest tunnel http://localhost:8787/api/poke/mcp -n "Run Coach"`.
2. **Set `POKE_MCP_TOKEN`** to a random string (`openssl rand -hex 32`) *before* exposing the
   endpoint, and restart. Unauthenticated calls then get a 401.
3. **Verify the MCP endpoint** answers a handshake:

   ```bash
   curl -s https://<your-host>/api/poke/mcp \
     -H "authorization: Bearer $POKE_MCP_TOKEN" -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```

4. **Register the integration** — CLI: `npx poke@latest login` then
   `npx poke@latest mcp add https://<your-host>/api/poke/mcp -n "Run Coach" -k "$POKE_MCP_TOKEN"`.
   Web: **poke.com → Integrations → New**, same URL + API key.
5. **Create the recipe** at [poke.com/kitchen](https://poke.com/kitchen) → **Create recipe**:
   - *Basics* — name `Run Coach` (or your own), short description.
   - *Onboarding* — `inputContext`: the runner's name as it should appear on the leaderboard, their
     target pace (min/km), and whether they want **roast** or **drill** coaching.
   - *Prefilled first message* — something that immediately exercises a tool, e.g.
     *"I'm training for a 10k. Check my Run Coach leaderboard and tell me where I stand."*
   - *Integrations* — select the Run Coach MCP integration as **required**. Mark credentials shared
     only if you want installers to use *your* deployment rather than their own.
6. **Publish** to get the `https://poke.com/r/<slug>` link, and re-sync tools from the integrations
   page whenever the tool list changes (Poke also re-syncs tunnels every 5 minutes).

## B. Connect a runner (per person)

1. Open the recipe link on the phone that has Poke, tap **Install**, answer the onboarding prompts
   (name, target pace, coach mode).
2. Send the prefilled first message; Poke should answer with real leaderboard data — that is proof
   the MCP round-trip works.
3. Optional, for the app→Poke direction: **poke.com → Settings → Advanced → API keys**, create a V2
   key, and put it in the deployment's `POKE_AI_API_KEY`. Without it the coaching channel records
   every message in a local outbox (`GET /api/poke/status`) instead of sending — fine for a demo.
4. Optional, for the Ghost Pacer Bet: add the group chat's inbound webhook URL as
   `POKE_WEBHOOK_URL` (+ `POKE_API_KEY`) so confession voice notes land in the group.
5. Set `PUBLIC_BASE_URL` to the public origin so audio clip URLs in messages are fetchable.
6. Go for a run in the 📍 Live Tracker tab (or import from Strava). On finish the app pushes a
   `run_completed` message and Poke replies with a coaching cue.

## C. Verify without leaving the terminal

```bash
# 1. Provider modes: expect poke/pokeAi "live" once keys are set
curl -s localhost:8787/api/health

# 2. Log a run -> triggers the outbound coaching message
curl -s -X POST localhost:8787/api/activities -H 'content-type: application/json' \
  -d '{"runnerName":"Isaac","distanceKm":10.2,"durationSec":3060}'

# 3. Every message Poke was (or would have been) sent, with its context payload
curl -s localhost:8787/api/poke/status

# 4. What Poke sees when it pulls
curl -s localhost:8787/api/poke/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_leaderboard","arguments":{"metric":"distance"}}}'
```

In mock mode (no keys) all four still work — messages accumulate in the outbox rather than being
delivered, which is exactly what the 🤖 Poke AI tab renders.

## Coach mode over Poke

The `coachMode` on a session decides the personality of every roast the engine fires, so drill mode
also shapes what Poke relays: drill copy is shouted and order-shaped ("close that gap. NOW"), roast
copy is dry. Poke messages carry the roast text and the clip URL, so a runner reading the chat later
sees the same line they heard mid-run. Switch with `PATCH /api/sessions/:id { "coachMode": "drill" }`
or the selector in the 🔥 tab; `COACH_DEFAULT_MODE` sets the default for new sessions.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Poke says the integration has no tools | `tools/list` unreachable or 401 | check the origin is public HTTPS and the API key in Poke equals `POKE_MCP_TOKEN`; re-sync tools |
| `401` on every MCP call | token mismatch, or set after registering | update the integration's API key, restart the server |
| Tools work locally, not from Poke | tunnel stopped, or `localhost` registered | restart `npx poke@latest tunnel`, or deploy |
| Messages appear in the outbox, never in chat | `POKE_AI_API_KEY` missing, or a `pk_` legacy key | create a **V2** key in Settings → Advanced |
| Audio link in chat does not play | `PUBLIC_BASE_URL` unset/not reachable, or serverless memory | set it to the deployed origin; see the serverless caveat in [setup.md](setup.md#4-vercel-hosting) |
| 4xx recorded, no retry | intentional — 4xx is not retried, only network/5xx up to `POKE_AI_MAX_ATTEMPTS` | fix the key/payload |

## Multi-runner scoping

Today the leaderboard is a single shared space and MCP requests are trusted after the bearer check.
Before more than one runner installs the recipe: map `X-Poke-User-Id` to a runner record on first
call, scope `list_recent_runs` / `get_runner_summary` / `log_run` to that mapping, and persist it
(the Supabase schema in [setup.md](setup.md#5-supabase-persistence) is where that table belongs).
Until then, treat a published recipe as a demo shared with people you trust.
