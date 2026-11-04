import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import Logo from '../components/Logo';
import PresenterQueue from '../components/PresenterQueue';
import TimerControls from '../components/TimerControls';
import { call, useLive } from '../lib/live';

/**
 * Event admin panel: presenter queue (CSV import, ordering, random pick),
 * stage timer, manual pitcher override, live stats and the join QR.
 */
export default function AdminPage() {
  const { session, loaded, connected, stats, presenters, clockOffset } = useLive('admin');
  const [pitcherName, setPitcherName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const joinUrl = `${window.location.origin}${window.location.pathname}#/`;

  // Sync the form with the pitcher whenever a new round starts (or on first load).
  useEffect(() => {
    if (session) {
      setPitcherName(session.pitcherName);
      setProjectName(session.projectName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, session?.round]);

  async function run(fn: () => Promise<void>, ok: string, failed: string) {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      setNotice(ok);
    } catch (err) {
      console.error(failed, err);
      setNotice(`${failed} — ${err instanceof Error ? err.message : 'check the console'}.`);
    } finally {
      setBusy(false);
    }
  }

  const setPitcher = (resetVotes: boolean) =>
    run(
      () => call('setPitcher', { pitcherName, projectName, resetVotes }),
      resetVotes ? 'Pitcher set — votes reset.' : 'Pitcher updated.',
      'Update failed',
    );

  const resetVotes = () => run(() => call('resetVotes'), 'Votes reset.', 'Reset failed');

  if (!loaded || !session) {
    return (
      <div className="center-screen">
        <p className="muted">Connecting…</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-title">
          <Logo className="logo-sm" />
          <h1>Event Admin</h1>
          {!connected && <span className="badge">Reconnecting…</span>}
        </div>
        <Link to="/display" className="btn btn-ghost" target="_blank">
          Open display screen ↗
        </Link>
      </header>

      <div className="admin-grid">
        <PresenterQueue session={session} presenters={presenters} />

        <TimerControls session={session} clockOffset={clockOffset} />

        <section className="card">
          <h2>Current pitcher</h2>
          <p className="muted small">Manual override — or use the presenter list above.</p>
          <label className="field">
            <span>Pitcher name</span>
            <input
              value={pitcherName}
              onChange={(e) => setPitcherName(e.target.value)}
              placeholder="e.g. Alex Rivera"
            />
          </label>
          <label className="field">
            <span>Project name</span>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. RoboBarista"
            />
          </label>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => setPitcher(true)} disabled={busy}>
              Set pitcher &amp; reset votes
            </button>
            <button className="btn" onClick={() => setPitcher(false)} disabled={busy}>
              Update names only
            </button>
          </div>
          <div className="btn-row">
            <button className="btn btn-danger" onClick={resetVotes} disabled={busy}>
              Reset votes
            </button>
          </div>
          {notice && <p className="muted">{notice}</p>}
          <p className="muted small">
            On stage now: <strong>{session.pitcherName || '—'}</strong>
            {session.projectName ? ` · ${session.projectName}` : ''} · round {session.round ?? 0}
          </p>
        </section>

        <section className="card">
          <h2>Live stats</h2>
          <div className="admin-stats">
            <div className="stat">
              <span className="stat-value">{stats.activeCount}</span>
              <span className="stat-label">connected</span>
            </div>
            <div className="stat">
              <span className={`stat-value ${stats.passing ? 'good-text' : 'bad-text'}`}>
                {stats.upPercent === null ? '—' : `${stats.upPercent}%`}
              </span>
              <span className="stat-label">want to continue</span>
            </div>
            <div className="stat">
              <span className="stat-value good-text">{stats.upCount}</span>
              <span className="stat-label">👍</span>
            </div>
            <div className="stat">
              <span className="stat-value bad-text">{stats.downCount}</span>
              <span className="stat-label">👎</span>
            </div>
          </div>
          <div className="progress-track small-track">
            <div
              className={`progress-fill ${stats.passing ? 'good' : 'bad'}`}
              style={{ width: `${stats.upPercent ?? 0}%` }}
            />
            <div className="progress-threshold" />
          </div>
          <p className="muted small">
            ≥ 50% of connected people must vote 👍 for the pitcher to continue. Not voting counts
            against the pitcher.
          </p>
        </section>

        <section className="card">
          <h2>Audience join link</h2>
          <div className="qr-wrap">
            <QRCodeSVG value={joinUrl} size={220} bgColor="#ffffff" fgColor="#0b0f17" marginSize={2} />
          </div>
          <p className="join-url">
            <a href={joinUrl}>{joinUrl}</a>
          </p>
          <p className="muted small">
            Put this QR on the projector (it is also on the display screen) or share the link
            directly. No sign-up needed — each device counts once.
          </p>
        </section>
      </div>
    </div>
  );
}
