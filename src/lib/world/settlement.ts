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
import type { Delta } from "./delta";
import { effectiveAffinity, affinityBand } from "./relationship";
import { classifyPrecision } from "./offstage";

const MAX_TRACE = 4;
const MAX_UNRESOLVED = 3;
const MAX_CANDIDATES = 3;

function subjectName(state: WorldState, entityId: string | undefined): string {
  if (!entityId) return "世界";
  return state.objects[entityId]?.name ?? state.locations[entityId]?.name ?? state.roster[entityId]?.name ?? state.characters?.[entityId]?.name ?? entityId;
}

function renderTraceFact(state: WorldState, fact: NonNullable<WorldState["facts"]>[number]): string {
  const subject = subjectName(state, fact.entityId);
  const value = fact.value.trim();
  switch (fact.field.trim()) {
    case "hidden":
      return `${subject}藏在${value}`;
    case "location":
      return `${subject}在${value}`;
    case "promise":
      return `${subject}承诺${value}`;
    case "state":
      return `${subject}：${value}`;
    default:
      return fact.entityId ? `${subject}的${fact.field}：${value}` : `${fact.field}：${value}`;
  }
}

function isPlayerKnownFact(fact: NonNullable<WorldState["facts"]>[number]): boolean {
  return fact.playerKnown === true;
}

function candidateForThread(thread: NonNullable<WorldState["pressureLines"]>[number]): string {
  const sign = thread.nextSign?.trim();
  if (sign) return sign;
  if (thread.playerKnown) return `${thread.summary}——还没完`;
  return thread.intensity >= 7 ? "某个未显形的压力正在逼近" : "某处有新的异样等你回去看";
}

function locationName(state: WorldState, locationId: string | undefined): string {
  if (!locationId) return "别处";
  return state.locations[locationId]?.name ?? locationId;
}

function trimSignText(value: string | undefined): string {
  return (value ?? "").trim().replace(/[。.!！?？]+$/u, "");
}

function relationshipReturnSign(state: WorldState, delta: Extract<Delta, { kind: "setRelationship" }>): string {
  const from = subjectName(state, delta.fromId);
  const to = subjectName(state, delta.toId);
  const reason = trimSignText(delta.reason);
  const disposition = trimSignText(delta.disposition);

  if (delta.toId === "you") {
    if (reason) return `${from}还记着${reason}，等你回应`;
    if (disposition) return `${from}带着${disposition}等你回来`;
    return `${from}对你的态度有了变化`;
  }

  if (reason) return `${from}和${to}之间还悬着${reason}`;
  if (disposition) return `${from}和${to}之间的气氛变得${disposition}`;
  return `${from}和${to}之间的气氛有了变化`;
}

function isReturnLocal(state: WorldState, entityId: string | undefined): boolean {
  if (!entityId) return false;
  return classifyPrecision(state, entityId) === "near";
}

function localDeltaReturnSign(state: WorldState, delta: Delta): string | null {
  switch (delta.kind) {
    case "setCondition": {
      if (!isReturnLocal(state, delta.entityId)) return null;
      const condition = trimSignText(delta.condition);
      if (!condition) return null;
      return `${subjectName(state, delta.entityId)}看起来${condition}`;
    }
    case "setObjectState": {
      if (!isReturnLocal(state, delta.objectId)) return null;
      const objectState = trimSignText(delta.state);
      if (!objectState) return null;
      return `${subjectName(state, delta.objectId)}有了变化：${objectState}`;
    }
    case "moveCharacter": {
      if (!isReturnLocal(state, delta.characterId)) return null;
      return `${subjectName(state, delta.characterId)}去了${locationName(state, delta.toLocationId)}`;
    }
    case "moveObject": {
      if (!isReturnLocal(state, delta.objectId)) return null;
      return `${subjectName(state, delta.objectId)}被挪到了${locationName(state, delta.toLocationId)}`;
    }
    case "setObjectLocked": {
      if (!isReturnLocal(state, delta.objectId)) return null;
      return `${subjectName(state, delta.objectId)}${delta.locked ? "锁上了" : "打开了"}`;
    }
    case "setRelationship": {
      if (!isReturnLocal(state, delta.fromId)) return null;
      return relationshipReturnSign(state, delta);
    }
    case "fleshObject":
      if (!isReturnLocal(state, delta.objectId)) return null;
      return `${subjectName(state, delta.objectId)}显露出更多细节`;
    case "fleshCharacter":
      if (!isReturnLocal(state, delta.characterId)) return null;
      return `${subjectName(state, delta.characterId)}显露出更多细节`;
    default:
      return null;
  }
}

function committedReturnSigns(state: WorldState, committedDeltas: Delta[]): string[] {
  const signs: string[] = [];
  const seen = new Set<string>();
  for (const delta of committedDeltas) {
    const sign = localDeltaReturnSign(state, delta);
    if (!sign || seen.has(sign)) continue;
    signs.push(sign);
    seen.add(sign);
    if (signs.length >= MAX_CANDIDATES) break;
  }
  return signs;
}

/** Derive the settlement record from the current world state. */
export function deriveSettlement(state: WorldState, committedDeltas: Delta[] = []): SettlementRecord {
  // trace: facts that hold (anchored or core) and are safe to show to the player.
  const trace = (state.facts ?? [])
    .filter((f) => f.hardness !== "ambient" && isPlayerKnownFact(f))
    .slice(-MAX_TRACE)
    .map((f) => renderTraceFact(state, f));

  // unresolved: active threads the player already knows; unknown summaries stay hidden.
  const active = (state.pressureLines ?? []).filter((p) => p.status === "active");
  const unresolved = active.filter((p) => p.playerKnown === true).slice(0, MAX_UNRESOLVED).map((p) => p.summary);

  // candidates: committed local offstage signs first, then thread hooks. Thread hooks
  // remain plausible openings; local signs are already committed facts made visible.
  const candidates = [...committedReturnSigns(state, committedDeltas), ...active.map(candidateForThread)].filter(Boolean).slice(0, MAX_CANDIDATES);

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

/** The Library card's one-line pull: prefer forward tension, then past trace. */
export function settlementLibraryHook(settlement: SettlementRecord | undefined): string {
  if (!settlement) return "";
  return settlement.candidates[0] || settlement.unresolved[0] || settlement.trace.at(-1) || (settlement.bond ? `${settlement.bond.who}：${settlement.bond.stance}` : "");
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
  const trace = settlement.trace.at(-1);
  if (trace) parts.push(`你留下的痕迹还在：${trace}。`);
  if (settlement.bond) parts.push(`${settlement.bond.who}对你的态度：${settlement.bond.stance}。`);
  const hook = settlement.candidates[0];
  if (hook) parts.push(hook);
  else if (settlement.unresolved[0]) parts.push(`悬而未决：${settlement.unresolved[0]}`);
  if (parts.length === 0) return null;
  return parts.join("");
}
