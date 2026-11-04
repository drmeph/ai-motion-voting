import { useEffect, useSyncExternalStore } from 'react';
import {
  PING_MS,
  type ClientRequest,
  type OpName,
  type Ops,
  type Presenter,
  type Role,
  type ServerMessage,
  type SessionState,
  type VoteStats,
  type VoteValue,
} from '../../shared/protocol';

export type { Presenter, SessionState, VoteStats, VoteValue };

export interface LiveState {
  connected: boolean;
  /** True once the first state message arrived. */
  loaded: boolean;
  session: SessionState | null;
  stats: VoteStats;
  myVote: VoteValue | null;
  presenters: Presenter[];
  /** serverClock ≈ Date.now() + clockOffset */
  clockOffset: number;
}

const PARTICIPANT_KEY = 'pitch-vote-participant-id';

const emptyStats: VoteStats = { activeCount: 0, upCount: 0, downCount: 0, votedCount: 0, upPercent: null, passing: false };

/** One device = one vote: a UUID kept in localStorage. */
function getParticipantId(): string {
  try {
    let id = localStorage.getItem(PARTICIPANT_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(PARTICIPANT_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * A single auto-reconnecting WebSocket to the event room, exposed as an
 * external store for React. Each page opens it with its role.
 */
class LiveConnection {
  state: LiveState = {
    connected: false,
    loaded: false,
    session: null,
    stats: emptyStats,
    myVote: null,
    presenters: [],
    clockOffset: 0,
  };
  private listeners = new Set<() => void>();
  private ws: WebSocket | null = null;
  private role: Role | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();
  private retry = 0;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private refs = 0;
  /** Best (largest) clock-offset sample on this connection. */
  private bestOffset = -Infinity;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.state;

  private set(patch: Partial<LiveState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  acquire(role: Role) {
    this.refs++;
    if (this.role !== role) {
      this.role = role;
      this.close();
      this.connect();
    }
    document.addEventListener('visibilitychange', this.onVisible);
  }

  release() {
    this.refs--;
    if (this.refs > 0) return;
    // Defer so React StrictMode's unmount/remount doesn't drop the socket.
    window.setTimeout(() => {
      if (this.refs > 0) return;
      document.removeEventListener('visibilitychange', this.onVisible);
      this.role = null;
      this.close();
    }, 0);
  }

  private onVisible = () => {
    // Phones kill sockets in the background; reconnect as soon as we're back.
    if (document.visibilityState === 'visible' && this.role && this.ws?.readyState !== WebSocket.OPEN) {
      this.retry = 0;
      this.close();
      this.connect();
    }
  };

  private connect() {
    if (!this.role) return;
    const params = new URLSearchParams({ role: this.role });
    if (this.role === 'audience') params.set('pid', getParticipantId());
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/api/ws?${params}`);
    this.ws = ws;
    this.bestOffset = -Infinity;

    ws.onopen = () => {
      this.retry = 0;
      this.set({ connected: true });
      ws.send('ping');
      this.pingTimer = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), PING_MS);
    };
    ws.onmessage = (ev) => {
      if (ev.data === 'pong') return;
      const msg = JSON.parse(ev.data as string) as ServerMessage;
      if (msg.type === 'ack') {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) p?.reject(new Error(msg.error));
        else p?.resolve();
        return;
      }
      // serverNow - localNow = trueOffset - latency, so the max sample is the best estimate.
      this.bestOffset = Math.max(this.bestOffset, msg.serverNow - Date.now());
      this.set({
        loaded: true,
        session: msg.session,
        stats: msg.stats,
        myVote: msg.myVote ?? null,
        presenters: msg.presenters ?? this.state.presenters,
        clockOffset: this.bestOffset,
      });
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.cleanupSocket();
      this.set({ connected: false });
      if (this.role) {
        const delay = Math.min(10_000, 500 * 2 ** this.retry++);
        this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
      }
    };
  }

  private cleanupSocket() {
    if (this.pingTimer) window.clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.ws = null;
    for (const p of this.pending.values()) p.reject(new Error('Connection lost'));
    this.pending.clear();
  }

  private close() {
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const ws = this.ws;
    if (ws) {
      this.cleanupSocket();
      ws.onclose = null;
      ws.close();
    }
  }

  call<K extends OpName>(op: K, ...[args]: Ops[K] extends Record<string, never> ? [] : [Ops[K]]): Promise<void> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Not connected'));
    const id = this.nextId++;
    const req: ClientRequest<K> = { id, op, args: (args ?? {}) as Ops[K] };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      ws.send(JSON.stringify(req));
    });
  }
}

const connection = new LiveConnection();

/** Live event state for this page. `role` decides what the server sends and allows. */
export function useLive(role: Role): LiveState {
  useEffect(() => {
    connection.acquire(role);
    return () => connection.release();
  }, [role]);
  return useSyncExternalStore(connection.subscribe, connection.getSnapshot);
}

/** Send an operation to the event room; resolves when the server applied it. */
export const call = connection.call.bind(connection);
