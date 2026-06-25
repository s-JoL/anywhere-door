/**
 * §4.7 Studio instrumentation — the per-turn trace channel (Context Inspector, §17).
 *
 * An out-of-world diagnostic stream: what the gate committed, what it rejected and
 * why, the casting decision, which threads fired. It is **in-memory only** — never
 * persisted, and never crosses the perception boundary (the §4.2 standing assertion
 * guards projections against exactly these out-of-world fields). No UI yet; this is
 * the data spine the Inspector will read.
 */

import type { Delta, DeltaSource } from "../world/delta";

export interface TraceCommit {
  source: DeltaSource;
  kind: string;
  cause: string;
}

export interface TraceRejection {
  source: DeltaSource;
  kind: string;
  reason: string;
}

export interface TurnTrace {
  instanceId: string;
  turn: number;
  casting: { active: string[]; ambient: string[] } | null;
  committed: TraceCommit[];
  rejected: TraceRejection[];
  /** ids of pressure lines opened/advanced/resolved this turn. */
  threadsFired: string[];
  notes: string[];
  /** present iff the turn rolled back / was dropped (stale or error). */
  outcome?: "completed" | "rolled-back" | "stale-dropped";
}

/** The subset the WriteGate needs to report into a trace (keeps the gate decoupled). */
export interface GateTrace {
  recordCommit(source: DeltaSource, delta: Delta): void;
  recordRejection(source: DeltaSource, delta: Delta, reason: string): void;
}

const THREAD_KINDS = new Set(["openThread", "advanceThread", "resolveThread"]);

/** A mutable per-turn collector. Implements GateTrace so it can be passed to the gate. */
export class TraceCollector implements GateTrace {
  private readonly trace: TurnTrace;

  constructor(instanceId: string, turn: number) {
    this.trace = { instanceId, turn, casting: null, committed: [], rejected: [], threadsFired: [], notes: [] };
  }

  setCasting(casting: { active: string[]; ambient: string[] }): void {
    this.trace.casting = casting;
  }

  recordCommit(source: DeltaSource, delta: Delta): void {
    this.trace.committed.push({ source, kind: delta.kind, cause: "" });
    if (THREAD_KINDS.has(delta.kind) && "id" in delta) this.trace.threadsFired.push(delta.id);
  }

  recordRejection(source: DeltaSource, delta: Delta, reason: string): void {
    this.trace.rejected.push({ source, kind: delta.kind, reason });
  }

  note(msg: string): void {
    this.trace.notes.push(msg);
  }

  finish(outcome: TurnTrace["outcome"] = "completed"): TurnTrace {
    this.trace.outcome = outcome;
    return this.trace;
  }
}

// ——— In-memory inspector channel: a bounded ring + subscribers (no persistence) ———

const RING_MAX = 50;
const ring: TurnTrace[] = [];
const listeners = new Set<(t: TurnTrace) => void>();

/** Emit a finished trace to the inspector channel. */
export function emitTrace(t: TurnTrace): void {
  ring.push(t);
  if (ring.length > RING_MAX) ring.shift();
  for (const l of listeners) l(t);
}

/** Most-recent-last snapshot of buffered traces (for the Inspector UI). */
export function recentTraces(): TurnTrace[] {
  return [...ring];
}

export function subscribeTrace(fn: (t: TurnTrace) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearTraces(): void {
  ring.length = 0;
}
