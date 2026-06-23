import type { WorldState, WorldRules } from "../types";

export type Delta =
  | { kind: "moveCharacter"; characterId: string; toLocationId: string }
  | { kind: "setObjectState"; objectId: string; state: string }
  | { kind: "setFlag"; key: string; value: string | number | boolean }
  | { kind: "advanceTime"; clock?: string; lighting?: string; dayDelta?: number }
  | { kind: "setCondition"; entityId: string; condition: string }
  | { kind: "establishObject"; id: string; name: string; locationId: string; state?: string };

export type Validation = { ok: true } | { ok: false; reason: string };

/** 只守不可变规则与结构完整性；状态本身自由变化。 */
export function validateDelta(state: WorldState, _rules: WorldRules, d: Delta): Validation {
  switch (d.kind) {
    case "moveCharacter": {
      if (!state.roster[d.characterId]) return { ok: false, reason: `角色 ${d.characterId} 不存在` };
      const here = Object.values(state.locations).find((l) => l.presentCharacterIds.includes(d.characterId));
      if (!here) return { ok: false, reason: `角色 ${d.characterId} 不在任何场景中` };
      if (!state.locations[d.toLocationId]) return { ok: false, reason: `目标场景 ${d.toLocationId} 不存在` };
      if (!here.connections.includes(d.toLocationId) && here.id !== d.toLocationId)
        return { ok: false, reason: `${here.id} 与 ${d.toLocationId} 不相连` };
      return { ok: true };
    }
    case "setObjectState":
      return state.objects[d.objectId] ? { ok: true } : { ok: false, reason: `对象 ${d.objectId} 不存在` };
    case "setFlag":
      return d.key ? { ok: true } : { ok: false, reason: "flag key 为空" };
    case "advanceTime":
      return { ok: true };
    case "setCondition":
      return state.roster[d.entityId]
        ? { ok: true }
        : { ok: false, reason: `实体 ${d.entityId} 不在名册中` };
    case "establishObject": {
      if (!state.locations[d.locationId])
        return { ok: false, reason: `地点 ${d.locationId} 不存在` };
      if (state.objects[d.id])
        return { ok: false, reason: `对象 ${d.id} 已存在` };
      return { ok: true };
    }
  }
}

/** 不可变应用；调用方应先 validateDelta。 */
export function applyDelta(state: WorldState, d: Delta): WorldState {
  switch (d.kind) {
    case "moveCharacter": {
      const locations: WorldState["locations"] = {};
      for (const [id, loc] of Object.entries(state.locations)) {
        const present = loc.presentCharacterIds.filter((c) => c !== d.characterId);
        if (id === d.toLocationId && !present.includes(d.characterId)) present.push(d.characterId);
        locations[id] = { ...loc, presentCharacterIds: present };
      }
      return { ...state, locations };
    }
    case "setObjectState": {
      const obj = state.objects[d.objectId];
      return { ...state, objects: { ...state.objects, [d.objectId]: { ...obj, state: d.state } } };
    }
    case "setFlag":
      return { ...state, flags: { ...state.flags, [d.key]: d.value } };
    case "advanceTime":
      return {
        ...state,
        time: {
          day: state.time.day + (d.dayDelta ?? 0),
          clock: d.clock ?? state.time.clock,
          lighting: d.lighting ?? state.time.lighting,
        },
      };
    case "setCondition": {
      const existing = state.roster[d.entityId];
      return {
        ...state,
        roster: { ...state.roster, [d.entityId]: { ...existing, condition: d.condition } },
      };
    }
    case "establishObject": {
      const loc = state.locations[d.locationId];
      const newObj = {
        id: d.id,
        name: d.name,
        detail: "fleshed" as const,
        props: {},
        locationId: d.locationId,
        state: d.state,
      };
      return {
        ...state,
        objects: { ...state.objects, [d.id]: newObj },
        locations: {
          ...state.locations,
          [d.locationId]: { ...loc, objectIds: [...loc.objectIds, d.id] },
        },
      };
    }
  }
}
