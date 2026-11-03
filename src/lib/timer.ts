import { useEffect, useState } from 'react';
import type { Session } from './client';

export interface TimerState {
  /** Configured length of the current timer, null if never started. */
  durationMs: number | null;
  remainingMs: number;
  running: boolean;
}

/** Pure read of the timer fields on the session, evaluated at `now`. */
export function readTimer(session: Session | null, now: number): TimerState {
  const durationMs = session?.timerDurationMs ?? null;
  const running = Boolean(session?.timerRunning);
  let remainingMs: number;
  if (running && session?.timerEndsAt != null) {
    remainingMs = session.timerEndsAt - now;
  } else {
    remainingMs = session?.timerRemainingMs ?? durationMs ?? 0;
  }
  return { durationMs, remainingMs: Math.max(0, remainingMs), running };
}

/** Live timer state; re-renders a few times a second while the timer runs. */
export function useTimer(session: Session | null): TimerState {
  const [now, setNow] = useState(() => Date.now());
  const running = Boolean(session?.timerRunning);

  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [running, session?.timerEndsAt]);

  return readTimer(session, now);
}

export function formatTimer(ms: number): string {
  // Ceil so the display shows 2:00 for the first second and hits 0:00 exactly at the end.
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Session field patches for each timer action (written by the admin). */
export const timerPatch = {
  start(durationMs: number, now = Date.now()) {
    return {
      timerDurationMs: durationMs,
      timerRemainingMs: durationMs,
      timerEndsAt: now + durationMs,
      timerRunning: true,
    };
  },
  pause(t: TimerState) {
    return { timerRemainingMs: t.remainingMs, timerEndsAt: null, timerRunning: false };
  },
  resume(t: TimerState, now = Date.now()) {
    return { timerRemainingMs: t.remainingMs, timerEndsAt: now + t.remainingMs, timerRunning: true };
  },
  reset(t: TimerState) {
    return { timerRemainingMs: t.durationMs, timerEndsAt: null, timerRunning: false };
  },
};
