import { QRCodeSVG } from 'qrcode.react';
import { useLiveVoting } from '../lib/useLiveVoting';

/** Big-screen projector view. Everything updates live via AppSync subscriptions. */
export default function DisplayPage() {
  const { session, sessionLoaded, stats } = useLiveVoting();
  const joinUrl = `${window.location.origin}${window.location.pathname}#/`;

  if (!sessionLoaded) {
    return (
      <div className="center-screen">
        <p className="muted">Connecting…</p>
      </div>
    );
  }

  const hasPitcher = Boolean(session?.pitcherName);
  const pct = stats.upPercent;

  return (
    <div className="display-page">
      <header className="display-header">
        <div>
          {hasPitcher ? (
            <>
              <h1 className="display-pitcher">{session!.pitcherName}</h1>
              {session?.projectName && <p className="display-project">{session.projectName}</p>}
            </>
          ) : (
            <h1 className="display-pitcher muted">Waiting for the next pitcher…</h1>
          )}
        </div>
        <div className="display-join">
          <QRCodeSVG value={joinUrl} size={140} bgColor="#ffffff" fgColor="#0b0f17" marginSize={2} />
          <span className="muted">Scan to vote</span>
        </div>
      </header>

      <main className="display-main">
        <div className={`display-percent ${pct === null ? '' : stats.passing ? 'good' : 'bad'}`}>
          {pct === null ? '—' : `${pct}%`}
        </div>
        <p className="display-caption">
          {pct === null ? 'No one connected yet' : stats.passing ? 'Want to continue — keep going! 🎉' : 'Want to continue'}
        </p>

        <div className="progress-track" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={`progress-fill ${stats.passing ? 'good' : 'bad'}`}
            style={{ width: `${pct ?? 0}%` }}
          />
          <div className="progress-threshold" title="50% needed to continue" />
        </div>

        <div className="display-stats">
          <div className="stat">
            <span className="stat-value">{stats.activeCount}</span>
            <span className="stat-label">connected</span>
          </div>
          <div className="stat">
            <span className="stat-value good-text">{stats.upCount}</span>
            <span className="stat-label">👍 continue</span>
          </div>
          <div className="stat">
            <span className="stat-value bad-text">{stats.downCount}</span>
            <span className="stat-label">👎 stop</span>
          </div>
        </div>
      </main>
    </div>
  );
}
