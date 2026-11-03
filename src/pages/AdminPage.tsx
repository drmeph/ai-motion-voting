import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import Logo from '../components/Logo';
import PresenterQueue from '../components/PresenterQueue';
import TimerControls from '../components/TimerControls';
import { getClient, SESSION_ID, type Presenter } from '../lib/client';
import { readTimer, timerPatch } from '../lib/timer';
import { useLiveVoting } from '../lib/useLiveVoting';

/**
 * Event admin panel: presenter queue (CSV import, ordering, random pick),
 * stage timer, manual pitcher override, live stats and the join QR.
 */
export default function AdminPage() {
  const { session, sessionLoaded, stats } = useLiveVoting();
  const [pitcherName, setPitcherName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const joinUrl = `${window.location.origin}${window.location.pathname}#/`;

  // Create the singleton session record the first time the admin opens up.
  useEffect(() => {
    if (!sessionLoaded || session) return;
    getClient()
      .models.Session.create({ id: SESSION_ID, pitcherName: '', projectName: '', round: 0 })
      .catch((err) => console.error('Failed to create session', err));
  }, [sessionLoaded, session]);

  // Pre-fill the form with the current pitcher once the session arrives.
  useEffect(() => {
    if (session) {
      setPitcherName(session.pitcherName ?? '');
      setProjectName(session.projectName ?? '');
    }
    // Only sync on first load / external change of pitcher, not every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.round]);

  async function setPitcher(resetVotes: boolean) {
    if (!session) return;
    setBusy(true);
    setNotice(null);
    try {
      await getClient().models.Session.update({
        id: session.id,
        pitcherName: pitcherName.trim(),
        projectName: projectName.trim(),
        round: resetVotes ? session.round + 1 : session.round,
        ...(resetVotes ? { currentPresenterId: null, ...timerPatch.reset(readTimer(session, Date.now())) } : {}),
      });
      setNotice(resetVotes ? 'Pitcher set — votes reset.' : 'Pitcher updated.');
    } catch (err) {
      console.error('Failed to update session', err);
      setNotice('Update failed — check the console.');
    } finally {
      setBusy(false);
    }
  }

  /** Put a queued presenter on stage: new round, timer reset, marked as presented. */
  async function putOnStage(p: Presenter) {
    if (!session) return;
    const client = getClient();
    await client.models.Session.update({
      id: session.id,
      pitcherName: p.name,
      projectName: p.projectName ?? '',
      currentPresenterId: p.id,
      round: session.round + 1,
      ...timerPatch.reset(readTimer(session, Date.now())),
    });
    setPitcherName(p.name);
    setProjectName(p.projectName ?? '');
    await client.models.Presenter.update({ id: p.id, presentedAt: Date.now() });
  }

  async function resetVotes() {
    if (!session) return;
    setBusy(true);
    setNotice(null);
    try {
      await getClient().models.Session.update({ id: session.id, round: session.round + 1 });
      setNotice('Votes reset.');
    } catch (err) {
      console.error('Failed to reset votes', err);
      setNotice('Reset failed — check the console.');
    } finally {
      setBusy(false);
    }
  }

  if (!sessionLoaded) {
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
        </div>
        <Link to="/display" className="btn btn-ghost" target="_blank">
          Open display screen ↗
        </Link>
      </header>

      <div className="admin-grid">
        {session && <PresenterQueue session={session} onStage={putOnStage} />}

        {session && <TimerControls session={session} />}

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
            On stage now: <strong>{session?.pitcherName || '—'}</strong>
            {session?.projectName ? ` · ${session.projectName}` : ''} · round {session?.round ?? 0}
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
