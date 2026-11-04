import { useState } from 'react';
import { TIMER_PRESETS_MIN } from '../config';
import type { OpName } from '../../shared/protocol';
import { call, type SessionState } from '../lib/live';
import { useTimer } from '../lib/timer';
import TimerDisplay from './TimerDisplay';

/** Admin card: start 2/3-minute timers, pause/resume, reset to the last length. */
export default function TimerControls({ session, clockOffset }: { session: SessionState; clockOffset: number }) {
  const timer = useTimer(session, clockOffset);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error('Timer update failed', err);
    } finally {
      setBusy(false);
    }
  }
  const simple = (op: Extract<OpName, 'timerPause' | 'timerResume' | 'timerReset'>) => () => run(() => call(op));

  const started = timer.durationMs != null;
  const done = started && timer.remainingMs <= 0;

  return (
    <section className="card">
      <h2>Stage timer</h2>
      <div className="admin-timer">
        {started ? <TimerDisplay timer={timer} /> : <p className="muted">No timer started yet.</p>}
      </div>
      <div className="btn-row">
        {TIMER_PRESETS_MIN.map((min) => (
          <button
            key={min}
            className="btn btn-primary"
            disabled={busy}
            onClick={() => run(() => call('timerStart', { durationMs: min * 60_000 }))}
          >
            ▶ Start {min}:00
          </button>
        ))}
      </div>
      <div className="btn-row">
        {timer.running ? (
          <button className="btn" disabled={busy || done} onClick={simple('timerPause')}>
            ⏸ Pause
          </button>
        ) : (
          <button className="btn" disabled={busy || !started || done} onClick={simple('timerResume')}>
            ▶ Resume
          </button>
        )}
        <button className="btn" disabled={busy || !started} onClick={simple('timerReset')}>
          ↺ Reset to {started ? `${Math.round(timer.durationMs! / 60_000)}:00` : '—'}
        </button>
      </div>
      <p className="muted small">
        The timer shows on the display screen and on audience phones. Putting a new presenter on stage
        resets it (paused) to the last length used.
      </p>
    </section>
  );
}
