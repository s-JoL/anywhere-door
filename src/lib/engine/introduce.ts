import type { WorldSeed, WorldState, Message } from "../types";
import { newId } from "../id";
import { nextTime } from "../clock";

/** seed 里存在、但当前不在任何场景在场名单中的角色 id。 */
export function offstageCharacterIds(seed: WorldSeed, state: WorldState): string[] {
  const present = new Set<string>();
  for (const loc of Object.values(state.locations)) for (const id of loc.presentCharacterIds) present.add(id);
  return seed.characters.map((c) => c.id).filter((id) => !present.has(id));
}

/** 把幕后角色加入某场景在场名单（不可变）。 */
export function introduceCharacter(state: WorldState, charId: string, locationId: string): WorldState {
  const loc = state.locations[locationId];
  if (!loc || loc.presentCharacterIds.includes(charId)) return state;
  return {
    ...state,
    locations: { ...state.locations, [locationId]: { ...loc, presentCharacterIds: [...loc.presentCharacterIds, charId] } },
  };
}

/** 登场旁白。 */
export function introductionBeat(instanceId: string, name: string): Message {
  return { id: newId("n"), instanceId, role: "system", speakerId: null, content: `${name}推门走了进来。`, narration: true, createdAt: nextTime() };
}
