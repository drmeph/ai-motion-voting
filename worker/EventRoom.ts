import { DurableObject } from 'cloudflare:workers';
import {
  ACTIVE_WINDOW_MS,
  type ClientRequest,
  type OpName,
  type Ops,
  type Presenter,
  type Role,
  type ServerMessage,
  type SessionState,
  type TimerState,
  type VoteStats,
  type VoteValue,
} from '../shared/protocol';
import type { Env } from './index';

interface Attachment {
  role: Role;
  /** Audience device id (localStorage UUID); one device = one vote. */
  pid?: string;
  connectedAt: number;
  /** Admin sockets only: true once the password was accepted. */
  authed?: boolean;
  failedLogins?: number;
}

interface StoredVote {
  vote: VoteValue;
  round: number;
}

const ADMIN_OPS = new Set<OpName>([
  'setPitcher',
  'resetVotes',
  'putOnStage',
  'timerStart',
  'timerPause',
  'timerResume',
  'timerReset',
  'importPresenters',
  'reorderPresenters',
  'setPresented',
  'removePresenter',
  'clearPresenters',
]);

/** Wrong passwords allowed per connection before it is closed. */
const MAX_FAILED_LOGINS = 5;
/** Wrong passwords allowed across all connections per minute. */
const MAX_FAILED_LOGINS_PER_MINUTE = 20;

/** Constant-time password check (hash first so lengths always match). */
async function passwordMatches(given: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/** Coalesce bursts of votes into one broadcast per window. */
const BROADCAST_DELAY_MS = 150;
/** While audience is connected, re-check presence this often. */
const PRESENCE_CHECK_MS = 15_000;
/** Close audience sockets silent for this long (dead mobile connections). */
const STALE_CLOSE_MS = 3 * ACTIVE_WINDOW_MS;

const emptyTimer = (): TimerState => ({ durationMs: null, remainingMs: 0, endsAt: null, running: false });

/**
 * The whole live event: current pitcher, round, timer, presenter queue and
 * votes. One instance (named "main") holds all state, persisted in its
 * built-in storage, and pushes updates to every connected screen over
 * WebSockets. Uses the hibernation API, so idle connections cost nothing.
 *
 * Presence = open audience WebSockets that have pinged recently; there are
 * no heartbeat writes.
 */
export class EventRoom extends DurableObject<Env> {
  private session!: SessionState;
  private presenters: Presenter[] = [];
  private votes = new Map<string, StoredVote>();
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;
  private lastStatsJson = '';
  /** Timestamps of recent wrong passwords (all connections). */
  private recentFailures: number[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Answered by the runtime without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      this.session = (await ctx.storage.get<SessionState>('session')) ?? {
        pitcherName: '',
        projectName: '',
        round: 0,
        currentPresenterId: null,
        timer: emptyTimer(),
      };
      this.presenters = (await ctx.storage.get<Presenter[]>('presenters')) ?? [];
      const votes = await ctx.storage.list<StoredVote>({ prefix: 'vote:' });
      for (const [key, v] of votes) this.votes.set(key.slice(5), v);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const role = (['audience', 'display', 'admin'] as const).find((r) => r === url.searchParams.get('role'));
    if (!role) return new Response('Missing or invalid role', { status: 400 });
    const pid = url.searchParams.get('pid') ?? undefined;
    if (role === 'audience' && !pid) return new Response('Missing pid', { status: 400 });

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role, pid, connectedAt: Date.now() } satisfies Attachment);

    this.send(server);
    if (role === 'audience') this.scheduleBroadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string') return;
    let req: ClientRequest;
    try {
      req = JSON.parse(raw);
    } catch {
      return;
    }
    const att = ws.deserializeAttachment() as Attachment;
    if (req.op === 'auth') {
      await this.login(ws, att, req as ClientRequest<'auth'>);
      return;
    }
    try {
      await this.handle(req, att);
      this.reply(ws, { type: 'ack', id: req.id });
    } catch (err) {
      this.reply(ws, { type: 'ack', id: req.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, 'closing');
    } catch {
      // already closed
    }
    this.scheduleBroadcast();
  }

  async webSocketError() {
    this.scheduleBroadcast();
  }

  /** Periodic presence check while audience is connected. */
  async alarm() {
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets('audience')) {
      if (now - this.lastSeen(ws) > STALE_CLOSE_MS) {
        try {
          ws.close(1000, 'stale');
        } catch {
          // ignore
        }
      }
    }
    if (JSON.stringify(this.computeStats()) !== this.lastStatsJson) this.broadcast();
    await this.ensureAlarm();
  }

  // ---------------------------------------------------------------- ops

  private async handle(req: ClientRequest, att: Attachment) {
    if (ADMIN_OPS.has(req.op) && !(att.role === 'admin' && att.authed)) throw new Error('Not allowed');
    const now = Date.now();
    const s = this.session;

    switch (req.op) {
      case 'vote': {
        const { vote } = req.args as Ops['vote'];
        if (att.role !== 'audience' || !att.pid) throw new Error('Not allowed');
        if (vote !== 'up' && vote !== 'down') throw new Error('Invalid vote');
        if (!s.pitcherName) throw new Error('Nobody is pitching');
        const v = { vote, round: s.round };
        this.votes.set(att.pid, v);
        await this.ctx.storage.put(`vote:${att.pid}`, v);
        this.scheduleBroadcast();
        return;
      }
      case 'setPitcher': {
        const a = req.args as Ops['setPitcher'];
        s.pitcherName = String(a.pitcherName ?? '').trim().slice(0, 200);
        s.projectName = String(a.projectName ?? '').trim().slice(0, 200);
        if (a.resetVotes) {
          s.round++;
          s.currentPresenterId = null;
          this.resetTimer();
        }
        break;
      }
      case 'resetVotes':
        s.round++;
        break;
      case 'putOnStage': {
        const p = this.findPresenter((req.args as Ops['putOnStage']).id);
        s.pitcherName = p.name;
        s.projectName = p.projectName;
        s.currentPresenterId = p.id;
        s.round++;
        this.resetTimer();
        p.presentedAt = now;
        await this.savePresenters();
        break;
      }
      case 'timerStart': {
        const d = Number((req.args as Ops['timerStart']).durationMs);
        if (!(d > 0 && d <= 3_600_000)) throw new Error('Invalid duration');
        s.timer = { durationMs: d, remainingMs: d, endsAt: now + d, running: true };
        break;
      }
      case 'timerPause':
        if (s.timer.running && s.timer.endsAt != null) {
          s.timer = { ...s.timer, remainingMs: Math.max(0, s.timer.endsAt - now), endsAt: null, running: false };
        }
        break;
      case 'timerResume':
        if (!s.timer.running && s.timer.remainingMs > 0) {
          s.timer = { ...s.timer, endsAt: now + s.timer.remainingMs, running: true };
        }
        break;
      case 'timerReset':
        this.resetTimer();
        break;
      case 'importPresenters': {
        const rows = (req.args as Ops['importPresenters']).rows;
        if (!Array.isArray(rows) || rows.length > 1000) throw new Error('Invalid list');
        this.presenters = rows
          .filter((r) => r && String(r.name ?? '').trim())
          .map((r) => ({
            id: crypto.randomUUID(),
            name: String(r.name).trim().slice(0, 200),
            projectName: String(r.projectName ?? '').trim().slice(0, 200),
            presentedAt: null,
          }));
        s.currentPresenterId = null;
        await this.savePresenters();
        break;
      }
      case 'reorderPresenters': {
        const ids = (req.args as Ops['reorderPresenters']).ids;
        const byId = new Map(this.presenters.map((p) => [p.id, p]));
        const ordered = ids.map((id) => byId.get(id)).filter((p): p is Presenter => Boolean(p));
        // Anything the client didn't list (e.g. imported concurrently) keeps its place at the end.
        const listed = new Set(ordered.map((p) => p.id));
        this.presenters = [...ordered, ...this.presenters.filter((p) => !listed.has(p.id))];
        await this.savePresenters();
        break;
      }
      case 'setPresented': {
        const a = req.args as Ops['setPresented'];
        this.findPresenter(a.id).presentedAt = a.presented ? now : null;
        await this.savePresenters();
        break;
      }
      case 'removePresenter': {
        const id = (req.args as Ops['removePresenter']).id;
        this.presenters = this.presenters.filter((p) => p.id !== id);
        if (s.currentPresenterId === id) s.currentPresenterId = null;
        await this.savePresenters();
        break;
      }
      case 'clearPresenters':
        this.presenters = [];
        s.currentPresenterId = null;
        await this.savePresenters();
        break;
      default:
        throw new Error(`Unknown op ${String(req.op)}`);
    }

    await this.ctx.storage.put('session', s);
    this.broadcast();
  }

  private async login(ws: WebSocket, att: Attachment, req: ClientRequest<'auth'>) {
    const fail = (error: string) => {
      this.reply(ws, { type: 'ack', id: req.id, error });
      if ((att.failedLogins ?? 0) >= MAX_FAILED_LOGINS) {
        try {
          ws.close(4003, 'Too many failed logins');
        } catch {
          // ignore
        }
      }
    };
    const expected = this.env.ADMIN_PASSWORD;
    if (att.role !== 'admin') return fail('Not allowed');
    if (!expected) return fail('Admin password is not configured on the server');

    // Count the attempt *before* any await, so parallel attempts on one
    // socket can't all slip through, and throttle guessing across sockets.
    const now = Date.now();
    this.recentFailures = this.recentFailures.filter((t) => now - t < 60_000);
    if ((att.failedLogins ?? 0) >= MAX_FAILED_LOGINS) return fail('Too many failed logins');
    if (this.recentFailures.length >= MAX_FAILED_LOGINS_PER_MINUTE) {
      return fail('Too many failed logins, try again in a minute');
    }
    att.failedLogins = (att.failedLogins ?? 0) + 1;
    ws.serializeAttachment(att);

    if (!(await passwordMatches(String(req.args?.password ?? ''), expected))) {
      this.recentFailures.push(Date.now());
      await new Promise((r) => setTimeout(r, 1000)); // slow down guessing
      return fail('Wrong password');
    }
    att.authed = true;
    att.failedLogins = 0;
    ws.serializeAttachment(att);
    this.reply(ws, { type: 'ack', id: req.id });
    this.send(ws);
  }

  private resetTimer() {
    const t = this.session.timer;
    this.session.timer = { durationMs: t.durationMs, remainingMs: t.durationMs ?? 0, endsAt: null, running: false };
  }

  private findPresenter(id: string) {
    const p = this.presenters.find((x) => x.id === id);
    if (!p) throw new Error('Presenter not found');
    return p;
  }

  private savePresenters() {
    return this.ctx.storage.put('presenters', this.presenters);
  }

  // ----------------------------------------------------------- presence

  private lastSeen(ws: WebSocket): number {
    const att = ws.deserializeAttachment() as Attachment;
    const pinged = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
    return Math.max(att.connectedAt, pinged);
  }

  /**
   * The room for the current presenter = devices connected right now plus
   * every device that voted this round. A vote keeps counting after the
   * phone sleeps or disconnects; someone connected who hasn't voted counts
   * against the presenter (the ≥ 50 %-of-the-room rule).
   */
  private computeStats(): VoteStats {
    const now = Date.now();
    const room = new Set<string>();
    for (const ws of this.ctx.getWebSockets('audience')) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const att = ws.deserializeAttachment() as Attachment;
      if (att.pid && now - this.lastSeen(ws) < ACTIVE_WINDOW_MS) room.add(att.pid);
    }
    let upCount = 0;
    let downCount = 0;
    for (const [pid, v] of this.votes) {
      if (v.round !== this.session.round) continue;
      room.add(pid);
      if (v.vote === 'up') upCount++;
      else downCount++;
    }
    const activeCount = room.size;
    const upPercent = activeCount === 0 ? null : Math.round((upCount / activeCount) * 100);
    return {
      activeCount,
      upCount,
      downCount,
      votedCount: upCount + downCount,
      upPercent,
      passing: upPercent !== null && upPercent >= 50,
    };
  }

  private async ensureAlarm() {
    if (this.ctx.getWebSockets('audience').length === 0) return;
    if ((await this.ctx.storage.getAlarm()) == null) {
      await this.ctx.storage.setAlarm(Date.now() + PRESENCE_CHECK_MS);
    }
  }

  // ---------------------------------------------------------- broadcast

  private scheduleBroadcast() {
    if (this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      this.broadcast();
    }, BROADCAST_DELAY_MS);
  }

  private broadcast() {
    if (this.broadcastTimer) {
      clearTimeout(this.broadcastTimer);
      this.broadcastTimer = null;
    }
    const stats = this.computeStats();
    this.lastStatsJson = JSON.stringify(stats);
    for (const ws of this.ctx.getWebSockets()) this.send(ws, stats);
    void this.ensureAlarm();
  }

  private send(ws: WebSocket, stats = this.computeStats()) {
    const att = ws.deserializeAttachment() as Attachment;
    const msg: ServerMessage = { type: 'state', serverNow: Date.now(), session: this.session, stats };
    if (att.role === 'audience' && att.pid) {
      const v = this.votes.get(att.pid);
      msg.myVote = v && v.round === this.session.round ? v.vote : null;
    }
    if (att.role === 'admin' && att.authed) msg.presenters = this.presenters;
    this.reply(ws, msg);
  }

  private reply(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // socket closing; it'll be dropped from getWebSockets()
    }
  }
}
