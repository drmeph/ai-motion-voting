import { useRef, useState } from 'react';
import { parsePresenterCsv } from '../lib/csv';
import { call, type Presenter, type SessionState } from '../lib/live';

interface Props {
  session: SessionState;
  presenters: Presenter[];
}

/**
 * Admin card: import presenters from CSV, reorder them (drag or arrows),
 * put the next / a random / a specific presenter on stage.
 */
export default function PresenterQueue({ session, presenters }: Props) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const remaining = presenters.filter((p) => p.presentedAt == null && p.id !== session.currentPresenterId);
  const nextUp = remaining[0] ?? null;

  async function run(label: string, fn: () => Promise<string | void>) {
    setBusy(true);
    setNotice(null);
    try {
      const msg = await fn();
      if (msg) setNotice(msg);
    } catch (err) {
      console.error(`${label} failed`, err);
      setNotice(`${label} failed — check the console.`);
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File) {
    const rows = parsePresenterCsv(await file.text());
    if (rows.length === 0) {
      setNotice('No presenters found in that file. Expected columns: name, project, (third column).');
      return;
    }
    if (presenters.length > 0 && !window.confirm(`Replace the current list of ${presenters.length} with ${rows.length} presenters from ${file.name}?`)) {
      return;
    }
    await run('Import', async () => {
      await call('importPresenters', { rows });
      return `Imported ${rows.length} presenters.`;
    });
  }

  function reorder(from: number, to: number) {
    if (from === to || to < 0 || to >= presenters.length) return;
    const next = [...presenters];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void run('Reorder', () => call('reorderPresenters', { ids: next.map((p) => p.id) }));
  }

  function shuffle() {
    // Shuffle only presenters who haven't gone yet; keep those who have at the top.
    const done = presenters.filter((p) => !remaining.includes(p));
    const rest = [...remaining];
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    void run('Shuffle', async () => {
      await call('reorderPresenters', { ids: [...done, ...rest].map((p) => p.id) });
      return 'Remaining order shuffled.';
    });
  }

  function pickRandom() {
    if (remaining.length === 0) return;
    const p = remaining[Math.floor(Math.random() * remaining.length)];
    void run('Random pick', async () => {
      await call('putOnStage', { id: p.id });
      return `🎲 Random pick: ${p.name} is on stage.`;
    });
  }

  function stage(p: Presenter) {
    void run('Put on stage', async () => {
      await call('putOnStage', { id: p.id });
      return `${p.name} is on stage.`;
    });
  }

  function togglePresented(p: Presenter) {
    void run('Update', async () => {
      await call('setPresented', { id: p.id, presented: p.presentedAt == null });
    });
  }

  function remove(p: Presenter) {
    if (!window.confirm(`Remove ${p.name} from the list?`)) return;
    void run('Remove', async () => {
      await call('removePresenter', { id: p.id });
    });
  }

  function clearAll() {
    if (!window.confirm(`Remove all ${presenters.length} presenters?`)) return;
    void run('Clear', async () => {
      await call('clearPresenters');
      return 'List cleared.';
    });
  }

  return (
    <section className="card presenters-card">
      <div className="card-head">
        <h2>Presenters</h2>
        <span className="muted small">
          {presenters.length} total · {remaining.length} still to go
        </span>
      </div>

      <div className="btn-row">
        <button className="btn btn-primary" disabled={busy || !nextUp} onClick={() => nextUp && stage(nextUp)}>
          ⏭ Next in order{nextUp ? `: ${nextUp.name}` : ''}
        </button>
        <button className="btn btn-primary" disabled={busy || remaining.length === 0} onClick={pickRandom}>
          🎲 Pick random
        </button>
        <button className="btn" disabled={busy || remaining.length < 2} onClick={shuffle}>
          🔀 Shuffle remaining
        </button>
      </div>

      <div className="btn-row">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importFile(f);
          }}
        />
        <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
          ⬆ Upload CSV
        </button>
        <button className="btn btn-danger" disabled={busy || presenters.length === 0} onClick={clearAll}>
          Clear list
        </button>
      </div>
      {notice && <p className="muted">{notice}</p>}

      {presenters.length === 0 ? (
        <p className="muted small">
          Upload a CSV with one presenter per row: <code>name, project, …</code> (a header row is
          optional). The row order becomes the running order.
        </p>
      ) : (
        <ol className="presenter-list">
          {presenters.map((p, i) => {
            const onStage = p.id === session.currentPresenterId;
            const done = p.presentedAt != null && !onStage;
            return (
              <li
                key={p.id}
                className={`presenter-row ${onStage ? 'on-stage' : ''} ${done ? 'done' : ''} ${overIndex === i && dragIndex !== null ? 'drag-over' : ''}`}
                draggable={!busy}
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverIndex(i);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) reorder(dragIndex, i);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
              >
                <span className="drag-handle" aria-hidden>⋮⋮</span>
                <span className="presenter-num">{i + 1}</span>
                <div className="presenter-info">
                  <strong>{p.name}</strong>
                  {onStage && <span className="badge badge-live">On stage</span>}
                  {done && <span className="badge">Done</span>}
                  <div className="muted small">
                    {[p.projectName, p.extra].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <div className="presenter-actions">
                  <button className="btn btn-sm" title="Move up" disabled={busy || i === 0} onClick={() => reorder(i, i - 1)}>
                    ↑
                  </button>
                  <button
                    className="btn btn-sm"
                    title="Move down"
                    disabled={busy || i === presenters.length - 1}
                    onClick={() => reorder(i, i + 1)}
                  >
                    ↓
                  </button>
                  <button className="btn btn-sm btn-primary" disabled={busy || onStage} onClick={() => stage(p)}>
                    On stage
                  </button>
                  <button
                    className="btn btn-sm"
                    title={p.presentedAt == null ? 'Mark as done' : 'Mark as not presented'}
                    disabled={busy || onStage}
                    onClick={() => togglePresented(p)}
                  >
                    {p.presentedAt == null ? '✓' : '↺'}
                  </button>
                  <button className="btn btn-sm btn-danger" title="Remove" disabled={busy} onClick={() => remove(p)}>
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
