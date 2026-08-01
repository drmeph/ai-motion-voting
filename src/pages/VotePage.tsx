import { useCallback, useEffect, useRef, useState } from 'react';
import { getClient, type Participant } from '../lib/client';
import { HEARTBEAT_MS, useLiveVoting } from '../lib/useLiveVoting';

const PARTICIPANT_KEY = 'pitch-vote-participant-id';

function getParticipantId(): string {
  let id = localStorage.getItem(PARTICIPANT_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PARTICIPANT_KEY, id);
  }
  return id;
}

/**
 * Mobile audience view. Registers this device as a Participant, keeps a
 * lastSeenAt heartbeat running, and lets the user vote (and change their
 * vote) for the current round.
 */
export default function VotePage() {
  const { session, sessionLoaded, stats } = useLiveVoting();
  const [me, setMe] = useState<Participant | null>(null);
  const [pending, setPending] = useState<'up' | 'down' | null>(null);
  const meRef = useRef<Participant | null>(null);
  meRef.current = me;

  // Register this device and keep the presence heartbeat alive.
  useEffect(() => {
    const client = getClient();
    const id = getParticipantId();
    let cancelled = false;

    async function register() {
      const existing = await client.models.Participant.get({ id });
      if (cancelled) return;
      if (existing.data) {
        const updated = await client.models.Participant.update({ id, lastSeenAt: Date.now() });
        if (!cancelled) setMe(updated.data ?? existing.data);
      } else {
        const created = await client.models.Participant.create({ id, lastSeenAt: Date.now() });
        if (!cancelled) setMe(created.data);
      }
    }

    async function heartbeat() {
      const updated = await client.models.Participant.update({ id, lastSeenAt: Date.now() });
      if (!cancelled && updated.data) setMe(updated.data);
    }

    register().catch((err) => console.error('Failed to join session', err));
    const interval = window.setInterval(() => {
      heartbeat().catch((err) => console.error('Heartbeat failed', err));
    }, HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        heartbeat().catch((err) => console.error('Heartbeat failed', err));
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const castVote = useCallback(
    async (vote: 'up' | 'down') => {
      const current = meRef.current;
      if (!current || !session) return;
      setPending(vote);
      try {
        const updated = await getClient().models.Participant.update({
          id: current.id,
          vote,
          votedRound: session.round,
          lastSeenAt: Date.now(),
        });
        if (updated.data) setMe(updated.data);
      } catch (err) {
        console.error('Vote failed', err);
      } finally {
        setPending(null);
      }
    },
    [session],
  );

  const round = session?.round ?? 0;
  const myVote = me && me.votedRound === round ? me.vote : null;
  const hasPitcher = Boolean(session?.pitcherName);

  if (!sessionLoaded) {
    return (
      <div className="center-screen">
        <p className="muted">Connecting…</p>
      </div>
    );
  }

  return (
    <div className="vote-page">
      <header className="vote-header">
        <span className="live-dot" aria-hidden />
        <span className="muted">
          {stats.activeCount} {stats.activeCount === 1 ? 'person' : 'people'} in the room
        </span>
      </header>

      <main className="vote-main">
        {hasPitcher ? (
          <>
            <p className="eyebrow">Now pitching</p>
            <h1 className="pitcher-name">{session!.pitcherName}</h1>
            {session?.projectName && <p className="project-name">{session.projectName}</p>}
          </>
        ) : (
          <>
            <p className="eyebrow">Welcome</p>
            <h1 className="pitcher-name">Hang tight</h1>
            <p className="project-name">Waiting for the next pitcher…</p>
          </>
        )}

        <p className="vote-question">Should they continue?</p>

        <div className="vote-buttons">
          <button
            className={`vote-btn vote-up ${myVote === 'up' ? 'selected' : ''}`}
            onClick={() => castVote('up')}
            disabled={!me || !hasPitcher || pending !== null}
          >
            <span className="vote-emoji">👍</span>
            <span>Continue</span>
          </button>
          <button
            className={`vote-btn vote-down ${myVote === 'down' ? 'selected' : ''}`}
            onClick={() => castVote('down')}
            disabled={!me || !hasPitcher || pending !== null}
          >
            <span className="vote-emoji">👎</span>
            <span>Stop</span>
          </button>
        </div>

        <p className="muted vote-hint">
          {myVote
            ? `Your vote: ${myVote === 'up' ? '👍 Continue' : '👎 Stop'} — tap the other button to change it.`
            : hasPitcher
              ? 'Tap a button to vote. You can change your vote any time.'
              : 'Voting opens when a pitcher is on stage.'}
        </p>
      </main>
    </div>
  );
}
