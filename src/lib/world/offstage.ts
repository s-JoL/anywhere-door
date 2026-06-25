/**
 * §5.5 Three-tier offstage precision (architecture §10; the single reconcile core).
 *
 * The world doesn't tick while you're away; on return the offstage reconciler lazily
 * fills in plausible change — but **bounded by relevance**:
 *   - near    (high)    — in the current scene or an adjacent location: may evolve
 *   - related (medium)  — bound to an active pressure line: may evolve
 *   - far     (frozen)  — everything else: frozen, no offstage change
 *
 * This classifier + bound is the reusable core the Phase 2 god-edit reconcile rides
 * (append-only, supersede-not-overwrite via the lock, witness-scoped). The actual
 * commit still goes through the WriteGate.
 */

import type { WorldState } from "../types";
import type { Delta } from "./delta";

export type PrecisionTier = "near" | "related" | "far";

/** The location an entity currently sits in (by character presence or object home). */
function entityLocationId(state: WorldState, entityId: string): string | undefined {
  const charLoc = Object.values(state.locations).find((l) => l.presentCharacterIds.includes(entityId));
  if (charLoc) return charLoc.id;
  return state.objects[entityId]?.locationId;
}

/** Classify an entity's offstage precision tier from scene proximity + thread links. */
export function classifyPrecision(state: WorldState, entityId: string): PrecisionTier {
  if (entityId === "you") return "near"; // the player is always the focal point
  const cur = state.locations[state.currentLocationId];
  const nearLocIds = new Set<string>([state.currentLocationId, ...(cur?.connections ?? [])]);
  const locId = entityLocationId(state, entityId);
  if (locId && nearLocIds.has(locId)) return "near";

  const activeThreads = (state.pressureLines ?? []).filter((p) => p.status === "active");
  const related = activeThreads.some(
    (p) =>
      (p.relatedCharacterIds ?? []).includes(entityId) ||
      (p.relatedLocationIds ?? []).includes(entityId) ||
      (locId ? (p.relatedLocationIds ?? []).includes(locId) : false),
  );
  return related ? "related" : "far";
}

/** May this entity change offstage? near/related yes; far is frozen. */
export function mayEvolve(state: WorldState, entityId: string): boolean {
  return classifyPrecision(state, entityId) !== "far";
}

/**
 * The entity an offstage delta targets, or null for world-global deltas (time, threads)
 * which the precision tiers don't gate.
 */
export function offstageDeltaTarget(d: Delta): string | null {
  switch (d.kind) {
    case "moveCharacter": return d.characterId;
    case "setCondition": return d.entityId;
    case "setObjectState":
    case "moveObject":
    case "setObjectLocked":
    case "fleshObject": return d.objectId;
    case "setRelationship": return d.fromId;
    case "fleshCharacter": return d.characterId;
    default: return null; // advanceTime / openThread / advanceThread / resolveThread / setFact …
  }
}

/**
 * Bound offstage proposals to the precision tiers: drop any delta whose target entity
 * is `far` (frozen). World-global deltas pass through untouched.
 */
export function boundOffstageDeltas(state: WorldState, deltas: Delta[]): Delta[] {
  return deltas.filter((d) => {
    const target = offstageDeltaTarget(d);
    return target === null || mayEvolve(state, target);
  });
}
