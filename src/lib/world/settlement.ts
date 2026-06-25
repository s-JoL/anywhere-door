/**
 * §5.6 Exit settlement + return echo (north star: return-rate).
 *
 * On exit, one bounded pass over the hub state derives a SettlementRecord:
 *   - trace       — what happened and holds (anchored+ facts), player-safe
 *   - unresolved  — active pressure lines, in player-safe summary language
 *   - candidates  — plausible openings for next time (NOT committed facts)
 *   - bond        — someone whose stance toward the player has shifted (§21 bond beat)
 *
 * On re-entry, `composeReturnEcho` turns the record + elapsed time into a single
 * return-open beat. The candidate it consumes is a *hook*, not canon — anything it
 * implies only becomes real once committed through the gate.
 *
 * Pure: reads state, writes nothing.
 */

import type { WorldState, SettlementRecord } from "../types";
import { effectiveAffinity, affinityBand } from "./relationship";

const MAX_TRACE = 4;
const MAX_UNRESOLVED = 3;
const MAX_CANDIDATES = 3;

/** Derive the settlement record from the current world state. */
export function deriveSettlement(state: WorldState): SettlementRecord {
  // trace: facts that hold (anchored or core) — earned, persistent truth.
  const trace = (state.facts ?? [])
    .filter((f) => f.hardness !== "ambient")
    .slice(-MAX_TRACE)
    .map((f) => (f.entityId ? `${f.entityId} 的 ${f.field}：${f.value}` : `${f.field}：${f.value}`));

  // unresolved: active threads, already player-safe summaries.
  const active = (state.pressureLines ?? []).filter((p) => p.status === "active");
  const unresolved = active.slice(0, MAX_UNRESOLVED).map((p) => p.summary);

  // candidates: a thread's next diegetic sign is a plausible opening (a hook, not a fact).
  const candidates = active
    .map((p) => p.nextSign?.trim() || (p.playerKnown ? `${p.summary}——还没完` : ""))
    .filter(Boolean)
    .slice(0, MAX_CANDIDATES);

  // bond: the strongest-felt stance toward the player (someone's changed mind).
  let bond: SettlementRecord["bond"];
  let best = 0;
  for (const [fromId, rels] of Object.entries(state.relationships ?? {})) {
    const rel = rels["you"];
    if (!rel) continue;
    const mag = Math.abs(effectiveAffinity(rel, state.time.day));
    if (mag > best) {
      best = mag;
      bond = { who: state.roster[fromId]?.name ?? fromId, stance: rel.disposition ?? affinityBand(effectiveAffinity(rel, state.time.day)) };
    }
  }

  return { trace, unresolved, candidates, bond, atDay: state.time.day };
}

/**
 * Compose the player-facing return-open beat from a settlement + how long they were
 * away. Consumes (at most) one candidate as the hook and surfaces the bond beat.
 * Returns null if there is nothing worth echoing.
 */
export function composeReturnEcho(settlement: SettlementRecord, hoursAway: number): string | null {
  const parts: string[] = [];
  if (hoursAway >= 1) {
    const span = hoursAway >= 24 ? `${Math.round(hoursAway / 24)} 天` : `${hoursAway} 小时`;
    parts.push(`你离开了约 ${span}。`);
  }
  if (settlement.bond) parts.push(`${settlement.bond.who}对你的态度：${settlement.bond.stance}。`);
  const hook = settlement.candidates[0];
  if (hook) parts.push(hook);
  else if (settlement.unresolved[0]) parts.push(`悬而未决：${settlement.unresolved[0]}`);
  if (parts.length === 0) return null;
  return parts.join("");
}
