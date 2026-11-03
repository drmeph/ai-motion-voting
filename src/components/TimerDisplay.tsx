import { TIMER_WARN_MS } from '../config';
import { formatTimer, type TimerState } from '../lib/timer';

/** Visual countdown. Renders nothing until a timer has been started once. */
export default function TimerDisplay({ timer, className = '' }: { timer: TimerState; className?: string }) {
  if (timer.durationMs == null) return null;
  const done = timer.remainingMs <= 0;
  const state = done ? 'done' : timer.remainingMs <= TIMER_WARN_MS ? 'warn' : 'ok';
  const pct = timer.durationMs > 0 ? (timer.remainingMs / timer.durationMs) * 100 : 0;

  return (
    <div className={`timer timer-${state} ${className}`} role="timer" aria-live="off">
      <div className="timer-digits">{done ? "Time's up" : formatTimer(timer.remainingMs)}</div>
      <div className="timer-bar">
        <div className="timer-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      {!timer.running && !done && <div className="timer-status">Paused</div>}
    </div>
  );
}
