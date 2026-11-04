import { useEffect, useState } from 'react';
import type { SessionState } from './live';

export interface TimerView {
  /** Configured length of the current timer, null if never started. */
  durationMs: number | null;
  remainingMs: number;
  running: boolean;
}

/**
 * Live countdown from the session's timer. `clockOffset` converts local time
 * to server time, so screens agree even if a device's clock is off.
 */
export function useTimer(session: SessionState | null, clockOffset: number): TimerView {
  const t = session?.timer;
  const running = Boolean(t?.running);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [running, t?.endsAt]);

  if (!t) return { durationMs: null, remainingMs: 0, running: false };
  const remaining = running && t.endsAt != null ? t.endsAt - (now + clockOffset) : t.remainingMs;
  return { durationMs: t.durationMs, remainingMs: Math.max(0, remaining), running };
}

export function formatTimer(ms: number): string {
  // Ceil so the display shows 2:00 for the first second and hits 0:00 exactly at the end.
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
