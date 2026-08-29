import { useCallback, useEffect, useState } from 'react';
import { formatPace, parsePace } from '../shared/pace.js';
import type { Bet, PokeDelivery } from '../shared/types.js';
import { api, clipUrl } from './api.js';
import { shouldSpeakLocally, speakText } from './tracking/audioCues.js';

export function BetPanel({ reloadKey }: { reloadKey: number }) {
  const [bets, setBets] = useState<Bet[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<PokeDelivery[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    creator: 'Priya',
    runner: 'Isaac',
    groupName: 'Thursday Run Club',
    groupId: 'poke-group-run-club',
    stake: 'one round of oat flat whites',
    dare: 'send the voice note of shame to the group',
    pace: '5:10',
    distance: '10',
  });
  const [progress, setProgress] = useState({ distance: '8.4', pace: '5:38' });

  const load = useCallback(async () => {
    const [{ bets: list }, { deliveries }] = await Promise.all([api.listBets(), api.outbox()]);
    setBets(list);
    setOutbox(deliveries);
    setSelectedId((current) => (list.some((bet) => bet.id === current) ? current : list[0]?.id ?? null));
  }, []);

  useEffect(() => {
    setStatus(null);
    load().catch((err: Error) => setStatus(err.message));
  }, [load, reloadKey]);

  const selected = bets.find((bet) => bet.id === selectedId) ?? null;

  const createBet = async () => {
    setBusy(true);
    try {
      const { bet } = await api.createBet({
        creator: form.creator,
        runner: form.runner,
        groupId: form.groupId,
        groupName: form.groupName,
        dare: form.dare,
        stake: form.stake,
        targets: [
          { label: `Average pace under ${form.pace}/km`, kind: 'avg_pace', value: parsePace(form.pace) },
          { label: `Cover at least ${form.distance}km`, kind: 'distance', value: Number(form.distance) },
        ],
      });
      setSelectedId(bet.id);
      setStatus(`Stake created for ${bet.runner}`);
      await load();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendProgress = async (final: boolean) => {
    if (!selected) {
      setStatus('Select a bet first.');
      return;
    }
    setBusy(true);
    try {
      const { evaluation } = await api.progress(selected.id, {
        distanceKm: Number(progress.distance),
        avgPaceSecPerKm: parsePace(progress.pace),
        final,
      });
      setStatus(
        final
          ? `Settled: ${evaluation.status}${evaluation.missedTargetIds.length ? ' — confession sent to Poke' : ''}`
          : `In progress · ${evaluation.atRiskTargetIds.length} target(s) at risk`,
      );
      await load();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid">
      <section className="card">
        <h2>Create a stake</h2>
        {(
          [
            ['creator', 'Created by'],
            ['runner', 'Runner on the hook'],
            ['groupName', 'Group name'],
            ['groupId', 'Poke group id'],
            ['stake', 'Stake'],
            ['dare', 'Dare if missed'],
            ['pace', 'Target average pace (m:ss)'],
            ['distance', 'Target distance (km)'],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
          </label>
        ))}
        <button disabled={busy} onClick={createBet}>
          Create Ghost Pacer Bet
        </button>
      </section>

      <section className="card">
        <h2>Monitor progress</h2>
        <label>
          Bet
          <select value={selectedId ?? ''} onChange={(e) => setSelectedId(e.target.value)}>
            {bets.map((bet) => (
              <option key={bet.id} value={bet.id}>
                {bet.runner} · {bet.groupName} · {bet.status}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <label>
            Distance (km)
            <input value={progress.distance} onChange={(e) => setProgress({ ...progress, distance: e.target.value })} />
          </label>
          <label>
            Average pace (m:ss)
            <input value={progress.pace} onChange={(e) => setProgress({ ...progress, pace: e.target.value })} />
          </label>
        </div>
        <div className="row">
          <button className="secondary" disabled={busy} onClick={() => sendProgress(false)}>
            Send progress ping
          </button>
          <button disabled={busy} onClick={() => sendProgress(true)}>
            Finish run &amp; settle
          </button>
        </div>
        {status && <p className="status">{status}</p>}
      </section>

      {selected && (
        <section className="card card--wide">
          <h2>
            {selected.runner} · <span className={`badge badge--${selected.status}`}>{selected.status}</span>
          </h2>
          <p className="muted">
            Stake: {selected.stake} · Dare: {selected.dare} · Group: {selected.groupName} ({selected.groupId})
          </p>
          <ul className="targets">
            {selected.targets.map((target) => {
              const missed = selected.missedTargetIds.includes(target.id);
              return (
                <li key={target.id} className={missed ? 'target target--missed' : 'target'}>
                  {target.label} —{' '}
                  {target.kind === 'avg_pace' ? formatPace(target.value) : `${target.value}km`}
                  {missed && <strong> MISSED</strong>}
                </li>
              );
            })}
          </ul>
          {selected.progress && (
            <p className="muted">
              Latest: {selected.progress.distanceKm}km at {formatPace(selected.progress.avgPaceSecPerKm)}
            </p>
          )}
          {selected.confession && (
            <article className="roast">
              <h3>Confession voice note</h3>
              <p>{selected.confession.text}</p>
              {selected.confession.audio && !shouldSpeakLocally(selected.confession.audio) ? (
                <audio controls src={clipUrl(selected.confession.audio.url)} />
              ) : (
                <div className="row">
                  <button
                    className="secondary"
                    onClick={() => speakText(selected.confession?.text ?? '')}
                  >
                    🔊 Speak confession
                  </button>
                  <span className="muted">
                    {selected.confession.audio
                      ? 'browser voice (mock provider)'
                      : `audio failed: ${selected.confession.audioError}`}
                  </span>
                </div>
              )}
              {selected.confession.delivery && (
                <p className={selected.confession.delivery.status === 'delivered' ? 'status' : 'error-inline'}>
                  Poke ({selected.confession.delivery.provider}): {selected.confession.delivery.status} after{' '}
                  {selected.confession.delivery.attempts} attempt(s)
                  {selected.confession.delivery.error ? ` — ${selected.confession.delivery.error}` : ''}
                </p>
              )}
            </article>
          )}
        </section>
      )}

      <section className="card card--wide">
        <h2>Poke outbox ({outbox.length})</h2>
        {outbox.length === 0 && <p className="muted">Nothing sent yet.</p>}
        {outbox.map((delivery) => (
          <article key={delivery.id} className="roast">
            <div className="roast__meta">
              <span className={`badge badge--${delivery.status === 'delivered' ? 'live' : 'missed'}`}>
                {delivery.status}
              </span>
              <span className="muted">
                {delivery.provider} · {delivery.groupId} · {new Date(delivery.at).toLocaleTimeString()}
              </span>
            </div>
            <p>{delivery.text}</p>
            {delivery.audioUrl && <audio controls src={clipUrl(delivery.audioUrl)} />}
            {delivery.error && <p className="error-inline">{delivery.error}</p>}
          </article>
        ))}
      </section>
    </div>
  );
}
