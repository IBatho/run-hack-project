import { useCallback, useEffect, useState } from 'react';
import type { PokeCoachMessage, PokeStatus } from '../shared/types.js';
import { api } from './api.js';

export function PokePanel({ reloadKey }: { reloadKey: number }) {
  const [status, setStatus] = useState<PokeStatus | null>(null);
  const [messages, setMessages] = useState<PokeCoachMessage[]>([]);
  const [runnerName, setRunnerName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.pokeStatus();
      setStatus(res.poke);
      setMessages(res.messages);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const sendDigest = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.pokeDigest(runnerName.trim() || undefined);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const mcpUrl =
    status && typeof window !== 'undefined' ? `${window.location.origin}${status.mcpPath}` : status?.mcpPath;

  return (
    <div className="grid">
      <section className="card">
        <h2>Poke AI coaching sync</h2>
        {status && (
          <p className="muted">
            <span className={`badge badge--${status.mode}`}>poke ai: {status.mode}</span>{' '}
            {status.mode === 'mock'
              ? 'No POKE_AI_API_KEY set — messages are recorded locally instead of being sent.'
              : `Messages POST to ${status.endpoint}.`}
          </p>
        )}
        <p className="muted">
          Finished runs and fired roasts are pushed to Poke automatically. A digest sends the whole
          leaderboard plus recent runs and asks Poke for a training focus.
        </p>

        <label>
          Runner (optional — blank sends the whole club)
          <input value={runnerName} onChange={(e) => setRunnerName(e.target.value)} placeholder="Isaac" />
        </label>

        <div className="row">
          <button disabled={busy} onClick={sendDigest}>
            {busy ? 'Sending…' : 'Send coaching digest'}
          </button>
        </div>

        {status && (
          <p className="muted">
            {status.messagesSent} message(s) sent
            {status.lastSyncAt && ` · last ${new Date(status.lastSyncAt).toLocaleTimeString()}`}
          </p>
        )}
        {error && <p className="error-banner">{error}</p>}
      </section>

      <section className="card">
        <h2>Ingestion (MCP)</h2>
        <p className="muted">
          Poke reads runs and logs new ones by calling this app as an MCP server. Add it in Poke with the
          URL below (it must be reachable over HTTPS — a tunnel works).
        </p>
        <pre className="code">{mcpUrl}</pre>
        <p className="muted">
          Tools: <code>get_leaderboard</code>, <code>list_recent_runs</code>, <code>get_runner_summary</code>
          , <code>log_run</code>.{' '}
          {status?.mcpAuthRequired
            ? 'A bearer token (POKE_MCP_TOKEN) is required.'
            : 'No token configured — set POKE_MCP_TOKEN before exposing it publicly.'}
        </p>
      </section>

      <section className="card card--wide">
        <h2>Coaching outbox ({messages.length})</h2>
        {messages.length === 0 && <p className="muted">Nothing sent yet — finish a run or send a digest.</p>}
        {messages.map((message) => (
          <article key={message.id} className="roast">
            <div className="roast__meta">
              <span className="badge">{message.event}</span>
              <span className={`badge badge--${message.provider}`}>{message.status}</span>
              <span className="muted">
                {message.runnerName} · {new Date(message.at).toLocaleTimeString()}
              </span>
            </div>
            <p>{message.message}</p>
            {message.error && <p className="error-banner">{message.error}</p>}
            <details>
              <summary className="muted">Context payload</summary>
              <pre className="code">{JSON.stringify(message.context, null, 2)}</pre>
            </details>
          </article>
        ))}
      </section>
    </div>
  );
}
