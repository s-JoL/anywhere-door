/**
 * §5.3 Belief graph — a *read view* over witness-scoped memory (architecture §7.3).
 *
 * NOT a second authority (that would break the single-source axiom). It is a pure
 * projection: given the hub's facts and each observer's own memories (§4.5), it yields
 * a per-(fact, observer) stance with evidence links. **Zero writes**, assembled on
 * demand. Powers the Director, the Context Inspector, and the player-facing World
 * Atlas — none of which may mutate state through it.
 *
 * Stance is derived from the §4.5 subjective-record fields, not from a stored belief:
 *   - unaware   — the observer has no memory referencing the fact
 *   - wrong     — a referencing memory is garbled / carries a distortion
 *   - knows     — a witnessed, high-confidence referencing memory
 *   - believes  — a heard/inferred (or mid-confidence witnessed) reference
 *   - suspects  — only low-confidence references
 */

import type { Fact, Memory } from "../types";
import { keywordsOf, relevance } from "../memory/keywords";

export type Stance = "knows" | "believes" | "suspects" | "unaware" | "wrong";

export interface BeliefEdge {
  observerId: string;
  factId: string;
  stance: Stance;
  confidence: number;     // the strongest supporting memory's confidence (0 if unaware)
  evidence: string[];     // ids of the observer's memories that reference the fact
}

export interface BeliefCtx {
  facts: Fact[];
  observers: string[];                       // character ids
  memoriesByObserver: Record<string, Memory[]>;
}

const KNOWS_CONFIDENCE = 0.8;
const SUSPECTS_CEILING = 0.5;

/** Does a memory reference this fact? Conservative keyword overlap on value + entity. */
function references(fact: Fact, mem: Memory): boolean {
  const needles = keywordsOf([fact.value, fact.entityId ?? ""].join(" "));
  if (needles.length === 0) return false;
  if (relevance(needles, mem.keywords) > 0) return true;
  // fall back to substring on the raw text (keywords may have dropped a multi-char run)
  return needles.some((n) => n.length >= 2 && mem.text.includes(n)) || mem.text.includes(fact.value);
}

/** The single (observer, fact) stance with its evidence. Pure. */
export function beliefOf(observerId: string, fact: Fact, memories: Memory[]): BeliefEdge {
  const refs = memories.filter((m) => references(fact, m));
  if (refs.length === 0) {
    return { observerId, factId: fact.id, stance: "unaware", confidence: 0, evidence: [] };
  }
  const evidence = refs.map((m) => m.id);
  // distorted/garbled reference → the observer is wrong about it
  const distorted = refs.find((m) => m.perceptionQuality === "garbled" || (m.distortion?.trim()?.length ?? 0) > 0);
  if (distorted) {
    return { observerId, factId: fact.id, stance: "wrong", confidence: distorted.confidence ?? 1, evidence };
  }
  const strongest = refs.reduce((a, b) => ((b.confidence ?? 1) > (a.confidence ?? 1) ? b : a));
  const conf = strongest.confidence ?? 1;
  let stance: Stance;
  if (conf < SUSPECTS_CEILING) stance = "suspects";
  else if (strongest.provenance === "witnessed" && conf >= KNOWS_CONFIDENCE) stance = "knows";
  else stance = "believes";
  return { observerId, factId: fact.id, stance, confidence: conf, evidence };
}

/**
 * Assemble the full graph for the given observers × facts. On-demand, zero writes.
 * `unaware` edges are omitted to keep the view focused (query `beliefOf` for the
 * exhaustive matrix if needed).
 */
export function assembleBeliefGraph(ctx: BeliefCtx): BeliefEdge[] {
  const out: BeliefEdge[] = [];
  for (const observerId of ctx.observers) {
    const memories = ctx.memoriesByObserver[observerId] ?? [];
    for (const fact of ctx.facts) {
      const edge = beliefOf(observerId, fact, memories);
      if (edge.stance !== "unaware") out.push(edge);
    }
  }
  return out;
}
