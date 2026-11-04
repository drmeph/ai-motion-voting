import { useState } from 'react';
import Logo from '../components/Logo';
import TimerDisplay from '../components/TimerDisplay';
import { AI_MOTION_PAGE_URL } from '../config';
import { call, useLive, type VoteValue } from '../lib/live';
import { useTimer } from '../lib/timer';

/**
 * Mobile audience view. Being connected counts this device as "in the room";
 * the user can vote (and change their vote) for the current round.
 */
export default function VotePage() {
  const { session, loaded, stats, myVote, connected, clockOffset } = useLive('audience');
  const timer = useTimer(session, clockOffset);
  const [pending, setPending] = useState<VoteValue | null>(null);

  async function castVote(vote: VoteValue) {
    setPending(vote);
    try {
      await call('vote', { vote });
    } catch (err) {
      console.error('Vote failed', err);
    } finally {
      setPending(null);
    }
  }

  const hasPitcher = Boolean(session?.pitcherName);

  if (!loaded) {
    return (
      <div className="center-screen">
        <p className="muted">Connecting…</p>
      </div>
    );
  }

  return (
    <div className="vote-page">
      <header className="vote-header">
        <span className="vote-presence">
          <span className={`live-dot ${connected ? "" : "off"}`} aria-hidden />
          <span className="muted">
            {connected
              ? `${stats.activeCount} ${stats.activeCount === 1 ? 'person' : 'people'} in the room`
              : 'Reconnecting…'}
          </span>
        </span>
      </header>

      <main className="vote-main">
        <Logo className="logo-vote" />
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

        <TimerDisplay timer={timer} className="timer-vote" />

        <p className="vote-question">Should they continue?</p>

        <div className="vote-buttons">
          <button
            className={`vote-btn vote-up ${myVote === 'up' ? 'selected' : ''}`}
            onClick={() => castVote('up')}
            disabled={!connected || !hasPitcher || pending !== null}
          >
            <span className="vote-emoji">👍</span>
            <span>Continue</span>
          </button>
          <button
            className={`vote-btn vote-down ${myVote === 'down' ? 'selected' : ''}`}
            onClick={() => castVote('down')}
            disabled={!connected || !hasPitcher || pending !== null}
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

      <footer className="vote-footer">
        <a href={AI_MOTION_PAGE_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-block">
          Visit AI Motion on Lead Bounty ↗
        </a>
      </footer>
    </div>
  );
}
