import type { WorldState, WorldRules } from "../types";

export type Delta =
  | { kind: "moveCharacter"; characterId: string; toLocationId: string }
  | { kind: "setObjectState"; objectId: string; state: string }
  | { kind: "setFlag"; key: string; value: string | number | boolean }
  | { kind: "advanceTime"; clock?: string; lighting?: string; dayDelta?: number }
  | { kind: "setCondition"; entityId: string; condition: string }
  | { kind: "establishObject"; id: string; name: string; locationId: string; state?: string }
  | { kind: "establishLocation"; id: string; name: string; gist?: string; description?: string; connectFrom?: string }
  | { kind: "moveScene"; toLocationId: string }
  | { kind: "setRelationship"; fromId: string; toId: string; disposition: string }
  | { kind: "establishLore"; id: string; keys: string[]; content: string };

export type Validation = { ok: true } | { ok: false; reason: string };

/** 一条 delta 里会落进世界的自由文本字段(用于红线筛查)。 */
function freeTextFields(d: Delta): string[] {
  switch (d.kind) {
    case "setObjectState": return [d.state];
    case "setCondition": return [d.condition];
    case "establishObject": return [d.name, d.state ?? ""];
    case "establishLocation": return [d.name, d.gist ?? "", d.description ?? ""];
    case "setRelationship": return [d.disposition];
    case "establishLore": return [d.content, ...d.keys];
    case "setFlag": return typeof d.value === "string" ? [d.value] : [];
    default: return [];
  }
}

/**
 * 红线兜底:对 delta 的自由文本做保守的关键词子串筛查。
 * 只在红线词条**字面命中**时拦截 —— 散文式红线(整句)不会误伤合法 delta,
 * 语义层面的约束交给 reactor prompt(软约束)。
 */
function screenRedLines(redLines: string[] | undefined, d: Delta): Validation {
  if (!redLines?.length) return { ok: true };
  const fields = freeTextFields(d).filter(Boolean).map((s) => s.toLowerCase());
  if (fields.length === 0) return { ok: true };
  for (const raw of redLines) {
    const line = raw.trim().toLowerCase();
    if (!line) continue;
    for (const f of fields) {
      if (f.includes(line)) return { ok: false, reason: `触犯红线「${raw}」` };
    }
  }
  return { ok: true };
}

/** 守不可变红线、结构完整性与空间规则；状态本身自由变化。 */
export function validateDelta(state: WorldState, rules: WorldRules, d: Delta): Validation {
  const screened = screenRedLines(rules.redLines, d);
  if (!screened.ok) return screened;
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
    case "establishLocation": {
      if (state.locations[d.id])
        return { ok: false, reason: `地点 ${d.id} 已存在` };
      const fromId = d.connectFrom ?? state.currentLocationId;
      if (!state.locations[fromId])
        return { ok: false, reason: `连接来源地点 ${fromId} 不存在` };
      return { ok: true };
    }
    case "moveScene": {
      if (!state.locations[d.toLocationId])
        return { ok: false, reason: `目标地点 ${d.toLocationId} 不存在` };
      const cur = state.locations[state.currentLocationId];
      if (d.toLocationId !== state.currentLocationId && !cur?.connections.includes(d.toLocationId))
        return { ok: false, reason: `${state.currentLocationId} 与 ${d.toLocationId} 不相连` };
      return { ok: true };
    }
    case "setRelationship": {
      if (!state.roster[d.fromId])
        return { ok: false, reason: `来源实体 ${d.fromId} 不在名册中` };
      if (!state.roster[d.toId])
        return { ok: false, reason: `目标实体 ${d.toId} 不在名册中` };
      if (d.fromId === d.toId)
        return { ok: false, reason: "不能对自身建立关系" };
      if (!d.disposition)
        return { ok: false, reason: "态度描述不能为空" };
      return { ok: true };
    }
    case "establishLore": {
      if ((state.lore ?? []).some((e) => e.id === d.id))
        return { ok: false, reason: `世界设定 ${d.id} 已存在` };
      if (!Array.isArray(d.keys) || d.keys.length === 0)
        return { ok: false, reason: "世界设定关键词不能为空" };
      if (!d.content)
        return { ok: false, reason: "世界设定内容不能为空" };
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
    case "establishLocation": {
      const fromId = d.connectFrom ?? state.currentLocationId;
      const fromLoc = state.locations[fromId];
      const newLoc = {
        id: d.id,
        name: d.name,
        detail: "fleshed" as const,
        gist: d.gist ?? "",
        description: d.description,
        connections: [fromId],
        presentCharacterIds: [],
        objectIds: [],
      };
      const fromConns = fromLoc.connections.includes(d.id)
        ? fromLoc.connections
        : [...fromLoc.connections, d.id];
      return {
        ...state,
        locations: {
          ...state.locations,
          [fromId]: { ...fromLoc, connections: fromConns },
          [d.id]: newLoc,
        },
      };
    }
    case "moveScene":
      return { ...state, currentLocationId: d.toLocationId };
    case "setRelationship":
      return {
        ...state,
        relationships: {
          ...state.relationships,
          [d.fromId]: {
            ...(state.relationships?.[d.fromId] ?? {}),
            [d.toId]: d.disposition,
          },
        },
      };
    case "establishLore":
      return {
        ...state,
        lore: [...(state.lore ?? []), { id: d.id, keys: d.keys, content: d.content }],
      };
  }
}
