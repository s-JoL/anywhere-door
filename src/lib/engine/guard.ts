/**
 * §5.8 Narration consistency guard.
 *
 * Prose is still model-generated, so a *cheap, conservative* guard screens the
 * high-value slips that break immersion: ambient narration that names an entity which
 * is not on stage (a character who isn't here, an object that isn't visible). The
 * guard is deliberately restrained — it flags only known offstage names that appear
 * verbatim — so it rarely false-positives; the snapshot and guard are
 * language-agnostic, while the narration *voice* lives in the renderer (§15.14).
 *
 * Pure: no I/O, no state mutation.
 */

import type { WorldState } from "../types";

export interface GuardSnapshot {
  /** Names on stage right now: present characters, visible objects, the location. */
  presentNames: string[];
  /** Known entity names that are NOT on stage (offstage characters). */
  offstageNames: string[];
}

export interface GuardResult {
  ok: boolean;
  /** Offstage names the prose mentioned as if present (the slips). */
  slips: string[];
}

/** Build the guard snapshot from the current scene. */
export function guardSnapshot(state: WorldState): GuardSnapshot {
  const loc = state.locations[state.currentLocationId];
  const presentIds = new Set(loc?.presentCharacterIds ?? []);
  const presentNames: string[] = [];
  for (const id of presentIds) presentNames.push(state.roster[id]?.name ?? id);
  if (loc?.name) presentNames.push(loc.name);
  for (const oid of loc?.objectIds ?? []) {
    const o = state.objects[oid];
    if (o && !o.archived) presentNames.push(o.name);
  }
  const offstageNames: string[] = [];
  for (const [id, o] of Object.entries(state.roster)) {
    if (id === "you" || presentIds.has(id)) continue;
    if (o.name) offstageNames.push(o.name);
  }
  return {
    presentNames: presentNames.filter(Boolean),
    offstageNames: offstageNames.filter(Boolean),
  };
}

/**
 * Screen prose for cheap high-value slips. A slip = a known offstage name that appears
 * in the prose while not also being on stage (ambiguous names are not flagged).
 */
export function consistencyGuard(prose: string, snapshot: GuardSnapshot): GuardResult {
  const present = new Set(snapshot.presentNames);
  const slips: string[] = [];
  for (const name of snapshot.offstageNames) {
    if (!name || present.has(name)) continue; // ambiguous (also present) → don't flag
    if (prose.includes(name)) slips.push(name);
  }
  return { ok: slips.length === 0, slips: [...new Set(slips)] };
}
