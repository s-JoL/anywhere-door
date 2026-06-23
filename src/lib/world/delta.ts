import type { WorldState, WorldRules, Character } from "../types";
import { applyRelationshipUpdate } from "./relationship";

export type Delta =
  | { kind: "moveCharacter"; characterId: string; toLocationId: string }
  | { kind: "setObjectState"; objectId: string; state: string }
  | { kind: "setFlag"; key: string; value: string | number | boolean }
  | { kind: "advanceTime"; clock?: string; lighting?: string; dayDelta?: number }
  | { kind: "setCondition"; entityId: string; condition: string }
  | { kind: "establishObject"; id: string; name: string; locationId: string; state?: string; locked?: boolean; gates?: string }
  | { kind: "establishLocation"; id: string; name: string; gist?: string; description?: string; connectFrom?: string }
  | { kind: "moveScene"; toLocationId: string }
  | { kind: "setRelationship"; fromId: string; toId: string; disposition?: string; affinityDelta?: number; reason?: string }
  | { kind: "establishLore"; id: string; keys: string[]; content: string }
  | { kind: "establishCharacter"; id: string; name: string; role?: string; goal?: string; locationId: string }
  | { kind: "moveObject"; objectId: string; toLocationId: string }
  | { kind: "setObjectLocked"; objectId: string; locked: boolean }
  | { kind: "fleshLocation"; locationId: string; description: string; gist?: string };

export type Validation = { ok: true } | { ok: false; reason: string };

/** delta 的来源类别(用于事件日志归因)。 */
export type DeltaSource = "user" | "reactor" | "flesh" | "offscreen";

/**
 * 事件日志一条:每个**经校验落库的 delta** 追加一条,记录 turn / 世界时间 / 逻辑时戳 /
 * 触发它的玩家输入。快照是当前态的快读;日志是历史——延时回调 / 声誉 / 离场演化都读它。
 */
export interface DeltaLogEntry {
  id: string;
  instanceId: string;
  turn: number;
  source: DeltaSource;
  cause: string;        // 触发本回合变化的玩家输入/动作
  gameDay: number;
  gameClock: string;
  at: number;           // 单调逻辑时戳(nextTime)
  delta: Delta;
}

/** 一条 delta 里会落进世界的自由文本字段(用于红线筛查)。 */
function freeTextFields(d: Delta): string[] {
  switch (d.kind) {
    case "setObjectState": return [d.state];
    case "setCondition": return [d.condition];
    case "establishObject": return [d.name, d.state ?? ""];
    case "establishLocation": return [d.name, d.gist ?? "", d.description ?? ""];
    case "setRelationship": return [d.disposition ?? "", d.reason ?? ""];
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

/** 物理因果:from 地点里是否有一扇上锁、且把守通往 toId 的门。返回挡路的门(或 null)。 */
function lockedDoorBlocking(state: WorldState, from: WorldState["locations"][string] | undefined, toId: string) {
  if (!from) return null;
  for (const oid of from.objectIds) {
    const o = state.objects[oid];
    if (o?.props?.locked === true && o.props.gates === toId) return o;
  }
  return null;
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
      {
        const door = lockedDoorBlocking(state, here, d.toLocationId);
        if (door) return { ok: false, reason: `${door.name} 锁着，过不去` };
      }
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
      {
        const door = lockedDoorBlocking(state, cur, d.toLocationId);
        if (door) return { ok: false, reason: `${door.name} 锁着，过不去` };
      }
      return { ok: true };
    }
    case "setRelationship": {
      if (!state.roster[d.fromId])
        return { ok: false, reason: `来源实体 ${d.fromId} 不在名册中` };
      if (!state.roster[d.toId])
        return { ok: false, reason: `目标实体 ${d.toId} 不在名册中` };
      if (d.fromId === d.toId)
        return { ok: false, reason: "不能对自身建立关系" };
      if (typeof d.affinityDelta !== "number" && !d.disposition?.trim() && !d.reason?.trim())
        return { ok: false, reason: "关系更新为空(需 affinityDelta / disposition / reason 之一)" };
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
    case "establishCharacter": {
      if (!d.name?.trim()) return { ok: false, reason: "角色名不能为空" };
      if (state.roster[d.id]) return { ok: false, reason: `角色 ${d.id} 已存在` };
      if (!state.locations[d.locationId])
        return { ok: false, reason: `地点 ${d.locationId} 不存在` };
      return { ok: true };
    }
    case "moveObject": {
      const obj = state.objects[d.objectId];
      if (!obj) return { ok: false, reason: `对象 ${d.objectId} 不存在` };
      if (!state.locations[d.toLocationId])
        return { ok: false, reason: `目标地点 ${d.toLocationId} 不存在` };
      // 物理因果:显式标记不可携带的物体搬不走(默认可移动)。
      if (obj.props?.portable === false)
        return { ok: false, reason: `${obj.name} 搬不动` };
      return { ok: true };
    }
    case "setObjectLocked":
      return state.objects[d.objectId] ? { ok: true } : { ok: false, reason: `对象 ${d.objectId} 不存在` };
    case "fleshLocation":
      if (!state.locations[d.locationId]) return { ok: false, reason: `地点 ${d.locationId} 不存在` };
      if (!d.description?.trim()) return { ok: false, reason: "充实描述不能为空" };
      return { ok: true };
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
        props: {
          ...(d.locked !== undefined ? { locked: d.locked } : {}),
          ...(d.gates ? { gates: d.gates } : {}),
        },
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
    case "setRelationship": {
      const prev = state.relationships?.[d.fromId]?.[d.toId];
      const next = applyRelationshipUpdate(
        prev,
        { affinityDelta: d.affinityDelta, reason: d.reason, disposition: d.disposition },
        state.time.day,
      );
      return {
        ...state,
        relationships: {
          ...state.relationships,
          [d.fromId]: { ...(state.relationships?.[d.fromId] ?? {}), [d.toId]: next },
        },
      };
    }
    case "establishLore":
      return {
        ...state,
        lore: [...(state.lore ?? []), { id: d.id, keys: d.keys, content: d.content }],
      };
    case "establishCharacter": {
      const loc = state.locations[d.locationId];
      const char: Character = {
        id: d.id,
        name: d.name,
        description: d.role ?? "",
        detail: "stub",
        ...(d.goal ? { goal: d.goal } : {}),
      };
      return {
        ...state,
        characters: { ...(state.characters ?? {}), [d.id]: char },
        roster: { ...state.roster, [d.id]: { name: d.name } },
        locations: {
          ...state.locations,
          [d.locationId]: {
            ...loc,
            presentCharacterIds: loc.presentCharacterIds.includes(d.id)
              ? loc.presentCharacterIds
              : [...loc.presentCharacterIds, d.id],
          },
        },
      };
    }
    case "moveObject": {
      const obj = state.objects[d.objectId];
      const locations: WorldState["locations"] = {};
      for (const [id, loc] of Object.entries(state.locations)) {
        const objectIds = loc.objectIds.filter((o) => o !== d.objectId);
        if (id === d.toLocationId && !objectIds.includes(d.objectId)) objectIds.push(d.objectId);
        locations[id] = { ...loc, objectIds };
      }
      return {
        ...state,
        objects: { ...state.objects, [d.objectId]: { ...obj, locationId: d.toLocationId } },
        locations,
      };
    }
    case "setObjectLocked": {
      const obj = state.objects[d.objectId];
      return {
        ...state,
        objects: { ...state.objects, [d.objectId]: { ...obj, props: { ...obj.props, locked: d.locked } } },
      };
    }
    case "fleshLocation": {
      const loc = state.locations[d.locationId];
      return {
        ...state,
        locations: {
          ...state.locations,
          [d.locationId]: { ...loc, description: d.description, gist: d.gist ?? loc.gist, detail: "fleshed" },
        },
      };
    }
  }
}
