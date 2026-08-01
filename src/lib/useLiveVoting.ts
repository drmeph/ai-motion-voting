import { useEffect, useMemo, useState } from 'react';
import { getClient, SESSION_ID, type Participant, type Session } from './client';

/** A participant is "in the session" if it heartbeated within this window. */
export const ACTIVE_WINDOW_MS = 60_000;
/** How often participant devices refresh their lastSeenAt heartbeat. */
export const HEARTBEAT_MS = 20_000;

export interface VoteStats {
  activeCount: number;
  upCount: number;
  downCount: number;
  votedCount: number;
  /** Percentage of *connected* people voting up (0-100), null if nobody is connected. */
  upPercent: number | null;
  passing: boolean;
}

/**
 * Shared real-time state for all three screens. Uses AppSync `observeQuery`
 * subscriptions so every connected client converges on the same session +
 * participant set without polling. A slow local tick re-evaluates the
 * time-based presence window even when no events arrive.
 */
export function useLiveVoting() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const client = getClient();

    const sessionSub = client.models.Session.observeQuery().subscribe({
      next: ({ items, isSynced }) => {
        setSession(items.find((s) => s.id === SESSION_ID) ?? items[0] ?? null);
        if (isSynced) setSessionLoaded(true);
      },
      error: (err) => console.error('Session subscription error', err),
    });

    const participantSub = client.models.Participant.observeQuery().subscribe({
      next: ({ items }) => setParticipants([...items]),
      error: (err) => console.error('Participant subscription error', err),
    });

    const tick = window.setInterval(() => setNow(Date.now()), 5_000);

    return () => {
      sessionSub.unsubscribe();
      participantSub.unsubscribe();
      window.clearInterval(tick);
    };
  }, []);

  const stats: VoteStats = useMemo(() => {
    const active = participants.filter((p) => now - p.lastSeenAt < ACTIVE_WINDOW_MS);
    const round = session?.round ?? 0;
    const voters = active.filter((p) => p.votedRound === round && (p.vote === 'up' || p.vote === 'down'));
    const upCount = voters.filter((p) => p.vote === 'up').length;
    const downCount = voters.length - upCount;
    const activeCount = active.length;
    const upPercent = activeCount === 0 ? null : Math.round((upCount / activeCount) * 100);
    return {
      activeCount,
      upCount,
      downCount,
      votedCount: voters.length,
      upPercent,
      passing: upPercent !== null && upPercent >= 50,
    };
  }, [participants, session, now]);

  return { session, sessionLoaded, participants, stats };
}
