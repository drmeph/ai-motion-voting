/**
 * Wire protocol between the browser and the EventRoom Durable Object.
 * Shared by the frontend (src/) and the Worker (worker/).
 *
 * Client → server: `ClientRequest` (JSON), plus the literal string "ping"
 * as a keep-alive (answered by the runtime without waking the object).
 * Server → client: `ServerMessage` (JSON).
 */

export type Role = 'audience' | 'display' | 'admin';
export type VoteValue = 'up' | 'down';

export interface TimerState {
  /** Length of the last started timer; null until a timer is started. */
  durationMs: number | null;
  /** Frozen remaining time while paused / stopped. */
  remainingMs: number;
  /** Server-clock epoch ms the timer hits zero, while running. */
  endsAt: number | null;
  running: boolean;
}

export interface SessionState {
  pitcherName: string;
  projectName: string;
  /** Bumped to reset votes: only votes cast in the current round count. */
  round: number;
  currentPresenterId: string | null;
  timer: TimerState;
}

export interface Presenter {
  id: string;
  name: string;
  projectName: string;
  /** Epoch ms when put on stage; null = not yet. */
  presentedAt: number | null;
}

export interface VoteStats {
  activeCount: number;
  upCount: number;
  downCount: number;
  votedCount: number;
  /** % of connected audience voting up (0-100), null if nobody is connected. */
  upPercent: number | null;
  passing: boolean;
}

export interface PresenterInput {
  name: string;
  projectName: string;
}

/** Every operation a client can request, with its arguments. */
export interface Ops {
  // audience
  vote: { vote: VoteValue };
  // admin
  setPitcher: { pitcherName: string; projectName: string; resetVotes: boolean };
  resetVotes: Record<string, never>;
  putOnStage: { id: string };
  timerStart: { durationMs: number };
  timerPause: Record<string, never>;
  timerResume: Record<string, never>;
  timerReset: Record<string, never>;
  importPresenters: { rows: PresenterInput[] };
  reorderPresenters: { ids: string[] };
  setPresented: { id: string; presented: boolean };
  removePresenter: { id: string };
  clearPresenters: Record<string, never>;
}
export type OpName = keyof Ops;

export interface ClientRequest<K extends OpName = OpName> {
  id: number;
  op: K;
  args: Ops[K];
}

export interface StateMessage {
  type: 'state';
  serverNow: number;
  session: SessionState;
  stats: VoteStats;
  /** Audience only: this device's vote in the current round. */
  myVote?: VoteValue | null;
  /** Admin only. Ordered = running order. */
  presenters?: Presenter[];
}

export interface AckMessage {
  type: 'ack';
  id: number;
  error?: string;
}

export type ServerMessage = StateMessage | AckMessage;

/** Audience connections that haven't pinged for this long don't count. */
export const ACTIVE_WINDOW_MS = 60_000;
/** Client keep-alive interval. */
export const PING_MS = 20_000;
