/**
 * End-to-end demo driver. Requires the API to be running (`npm run dev`).
 *
 *   npm run demo                     # against http://localhost:8787
 *   BASE_URL=http://host:8787 npm run demo
 */
import { formatPace } from '../src/shared/pace.js';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:8787').replace(/\/$/, '');

const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${JSON.stringify(body)}`);
  return body as T;
};

const post = <T>(path: string, payload: unknown) =>
  call<T>(path, { method: 'POST', body: JSON.stringify(payload) });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const health = await call<{ providers: Record<string, string> }>('/api/health');
  console.log('providers:', health.providers);

  await post('/api/demo/reset', {});

  // --- Feature 1: Audio Roast Engine -------------------------------------
  const { sessions } = await call<{ sessions: Array<{ id: string; runnerName: string }> }>('/api/sessions');
  const session = sessions[0];
  await call(`/api/sessions/${session.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ targetPaceSecPerKm: 300, tolerancePct: 0.05, debounceSamples: 2, cooldownSec: 0 }),
  });
  console.log(`\n== Audio Roast Engine (${session.runnerName}, target ${formatPace(300)}) ==`);

  const series = [292, 298, 318, 341, 352, 296];
  for (const [index, paceSecPerKm] of series.entries()) {
    const result = await post<{
      decision: { reason: string };
      roast: { text: string; audio: { url: string; provider: string } | null } | null;
    }>(`/api/sessions/${session.id}/samples`, { paceSecPerKm, distanceKm: index + 1 });

    console.log(`km ${index + 1} @ ${formatPace(paceSecPerKm)} -> ${result.decision.reason}`);
    if (result.roast) {
      console.log(`  🔥 ${result.roast.text}`);
      console.log(`  🔊 ${result.roast.audio?.url} (${result.roast.audio?.provider})`);
    }
    await sleep(200);
  }

  // --- Feature 2: Ghost Pacer Bet ----------------------------------------
  const { bets } = await call<{ bets: Array<{ id: string; runner: string; groupName: string }> }>('/api/bets');
  const bet = bets[0];
  console.log(`\n== Ghost Pacer Bet (${bet.runner} vs ${bet.groupName}) ==`);

  const mid = await post<{ bet: { status: string }; evaluation: { atRiskTargetIds: string[] } }>(
    `/api/bets/${bet.id}/progress`,
    { distanceKm: 6, avgPaceSecPerKm: 335, elapsedSec: 2010 },
  );
  console.log(`mid-run: ${mid.bet.status}, ${mid.evaluation.atRiskTargetIds.length} target(s) at risk`);

  const final = await post<{
    bet: { status: string; missedTargetIds: string[] };
    confession: {
      text: string;
      audio: { url: string; provider: string } | null;
      delivery: { status: string; provider: string; attempts: number; error: string | null } | null;
    } | null;
  }>(`/api/bets/${bet.id}/progress`, { distanceKm: 8.4, avgPaceSecPerKm: 338, elapsedSec: 2839, final: true });

  console.log(`settled: ${final.bet.status} (${final.bet.missedTargetIds.length} missed)`);
  if (final.confession) {
    console.log(`  🎙️ ${final.confession.text}`);
    console.log(`  🔊 ${final.confession.audio?.url} (${final.confession.audio?.provider})`);
    console.log(
      `  📤 poke ${final.confession.delivery?.provider}: ${final.confession.delivery?.status} after ${final.confession.delivery?.attempts} attempt(s)${
        final.confession.delivery?.error ? ` — ${final.confession.delivery.error}` : ''
      }`,
    );
  }

  console.log('\nOpen http://localhost:5173 to play the audio in the prototype UI.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
