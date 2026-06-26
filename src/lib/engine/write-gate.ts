/**
 * §4.1 WriteGate — the sole durable writer (architecture.md §11; charter §3).
 *
 * "The model proposes, the engine validates." Raising authority never bypasses the
 * gate. This is the **only** place that calls `applyDelta` + `repo.appendDeltaLog`:
 * every durable world mutation — user, reactor, offstage, flesh, director, god —
 * routes through `commit`.
 *
 * `commit` validates each proposal against the live (running) state, applies valid
 * deltas immutably **in order** (later deltas see earlier ones), logs each with full
 * attribution (turn / source / cause / game time), and **records rejections with
 * reasons** (previously only `console.warn`-ed and lost). The gate writes state and
 * the change log — nothing else; side effects like memory derivation stay outside it
 * (charter §3: the gate writes state, not memory).
 */

import type { WorldState, WorldRules } from "../types";
import type { Delta, DeltaSource, DeltaLogEntry } from "../world/delta";
import { validateDelta, applyDelta } from "../world/delta";
import type { GateTrace } from "./trace";
import { newId } from "../id";
import { nextTime } from "../clock";

/** Who authored a proposal. Superset of the legacy log sources; see DeltaSource. */
export type ProposalSource = DeltaSource;

export interface Proposal {
  delta: Delta;
  source: ProposalSource;
  /** The player input/action that triggered this change (logged as `cause`). */
  cause: string;
}

export interface RejectionRecord {
  delta: Delta;
  reason: string;
  source: ProposalSource;
}

export interface CommitResult {
  /** The new state after all valid deltas applied in order. */
  state: WorldState;
  committed: Delta[];
  rejected: RejectionRecord[];
}

export interface GateCtx {
  state: WorldState;
  rules: WorldRules;
  instanceId: string;
  branchId?: string;
  turn: number;
  /** Only the append-log capability is needed; keeps the gate testable. */
  repo: Pick<Repo, "appendDeltaLog">;
  /** Rejection sink (defaults to console.warn). Out-of-world; never a projection. */
  logger?: (msg: string) => void;
  /** Injectable monotonic timestamp (defaults to nextTime) for deterministic tests. */
  now?: () => number;
  /** Studio trace (§4.7). Out-of-world diagnostics; never crosses the boundary. */
  trace?: GateTrace;
}

type Repo = { appendDeltaLog: (e: DeltaLogEntry) => Promise<void> };

function normalizeDeltaForSource(delta: Delta, source: ProposalSource): Delta {
  if (delta.kind !== "setFact" || delta.playerKnown !== undefined) return delta;
  if (source === "user" || source === "reactor") return { ...delta, playerKnown: true };
  return delta;
}

/**
 * Validate → apply (in order) → log each committed delta; collect rejections.
 * The sole call site of applyDelta + appendDeltaLog in the runtime.
 */
export async function commit(ctx: GateCtx, proposals: Proposal[]): Promise<CommitResult> {
  const warn = ctx.logger ?? ((m: string) => console.warn(m));
  const now = ctx.now ?? nextTime;

  let state = ctx.state;
  const committed: Delta[] = [];
  const rejected: RejectionRecord[] = [];

  for (const p of proposals) {
    const delta = normalizeDeltaForSource(p.delta, p.source);
    const v = validateDelta(state, ctx.rules, delta, p.source);
    if (!v.ok) {
      rejected.push({ delta, reason: v.reason, source: p.source });
      warn(`[${p.source}] 丢弃非法 delta: ${v.reason}`);
      ctx.trace?.recordRejection(p.source, delta, v.reason);
      continue;
    }
    state = applyDelta(state, delta);
    ctx.trace?.recordCommit(p.source, delta);
    // Log reads game time from the post-apply state (an advanceTime delta is logged
    // at the time it produced) — matching the prior inline behavior.
    const entry: DeltaLogEntry = {
      id: newId("dl"),
      instanceId: ctx.instanceId,
      turn: ctx.turn,
      source: p.source,
      cause: p.cause,
      gameDay: state.time.day,
      gameClock: state.time.clock,
      at: now(),
      delta,
    };
    if (ctx.branchId) entry.branchId = ctx.branchId;
    await ctx.repo.appendDeltaLog(entry);
    committed.push(delta);
  }

  return { state, committed, rejected };
}
