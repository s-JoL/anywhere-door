import type { WorldSeed, WorldState, Message } from "../types";
import { newId } from "../id";
import { nextTime } from "../clock";

/** Ids of characters present in the seed but not currently on any location's onstage list. */
export function offstageCharacterIds(seed: WorldSeed, state: WorldState): string[] {
  const present = new Set<string>();
  for (const loc of Object.values(state.locations)) for (const id of loc.presentCharacterIds) present.add(id);
  return seed.characters.map((c) => c.id).filter((id) => !present.has(id));
}

/** Add an offstage character to a location's onstage list (immutable). */
export function introduceCharacter(state: WorldState, charId: string, locationId: string): WorldState {
  const loc = state.locations[locationId];
  if (!loc || loc.presentCharacterIds.includes(charId)) return state;
  return {
    ...state,
    locations: { ...state.locations, [locationId]: { ...loc, presentCharacterIds: [...loc.presentCharacterIds, charId] } },
  };
}

/** Entrance narration. */
export function introductionBeat(instanceId: string, name: string): Message {
  return { id: newId("n"), instanceId, role: "system", speakerId: null, content: `${name}推门走了进来。`, narration: true, createdAt: nextTime() };
}
