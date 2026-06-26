import type { WorldState, WorldRules, Character, Hardness } from "../types";
import { applyRelationshipUpdate } from "./relationship";

export type Delta =
  | { kind: "moveCharacter"; characterId: string; toLocationId: string }
  | { kind: "setObjectState"; objectId: string; state: string }
  | { kind: "setFlag"; key: string; value: string | number | boolean }
  | { kind: "setTension"; value: number }
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
  | { kind: "fleshLocation"; locationId: string; description: string; gist?: string }
  // ——— §4.6/§5.2 pressure lines / suspense threads (advanced only through the write gate) ———
  | { kind: "openThread"; id: string; summary: string; intensity?: number; relatedCharacterIds?: string[]; relatedLocationIds?: string[]; threadKind?: string; playerKnown?: boolean; nextSign?: string }
  | { kind: "advanceThread"; id: string; intensityDelta?: number; summary?: string; status?: "latent" | "active" | "resolved"; playerKnown?: boolean; nextSign?: string }
  | { kind: "resolveThread"; id: string }
  // ——— §5.1 graded facts (canon hardness; only through the write gate) ———
  | { kind: "setFact"; id: string; field: string; value: string; entityId?: string; hardness?: Hardness; playerKnown?: boolean }
  // ——— §5.7 entity lifecycle (stub→fleshed across all types; archive, never delete) ———
  | { kind: "fleshObject"; objectId: string; state?: string; name?: string }
  | { kind: "fleshCharacter"; characterId: string; description: string; goal?: string }
  | { kind: "retireEntity"; entityId: string; entityType: "character" | "object" };

export const DELTA_KINDS = [
  "moveCharacter",
  "setObjectState",
  "setFlag",
  "setTension",
  "advanceTime",
  "setCondition",
  "establishObject",
  "establishLocation",
  "moveScene",
  "setRelationship",
  "establishLore",
  "establishCharacter",
  "moveObject",
  "setObjectLocked",
  "fleshLocation",
  "openThread",
  "advanceThread",
  "resolveThread",
  "setFact",
  "fleshObject",
  "fleshCharacter",
  "retireEntity",
] as const;

const DELTA_KIND_SET = new Set<string>(DELTA_KINDS);

export function isDeltaKind(kind: string): kind is Delta["kind"] {
  return DELTA_KIND_SET.has(kind);
}

export type Validation = { ok: true } | { ok: false; reason: string };

/**
 * Source category of a delta (for event-log attribution). Synonymous with the
 * WriteGate's ProposalSource: every proposal carries a source, the persisted log
 * records it verbatim, for Context Inspector / offstage-reconciliation attribution.
 */
export type DeltaSource =
  | "user"
  | "reactor"
  | "director"
  | "offscreen"
  | "flesh"
  | "materializer"
  | "god";

/**
 * One event-log entry: appended for every **validated, persisted delta**, recording
 * turn / world time / logical timestamp / the player input that triggered it. The
 * snapshot is a fast read of the current state; the log is history — delayed
 * callbacks / reputation / offstage evolution all read it.
 */
export interface DeltaLogEntry {
  id: string;
  instanceId: string;
  branchId?: string;
  turn: number;
  source: DeltaSource;
  cause: string;        // player input/action that triggered this turn's change
  gameDay: number;
  gameClock: string;
  at: number;           // monotonic logical timestamp (nextTime)
  delta: Delta;
  /** Soft-hidden from the active timeline view; retained for append-only audit/history. */
  archived?: boolean;
}

/** Free-text fields in a delta that land in the world (used for red-line screening). */
function freeTextFields(d: Delta): string[] {
  switch (d.kind) {
    case "setObjectState": return [d.state];
    case "setCondition": return [d.condition];
    case "establishObject": return [d.name, d.state ?? ""];
    case "establishLocation": return [d.name, d.gist ?? "", d.description ?? ""];
    case "setRelationship": return [d.disposition ?? "", d.reason ?? ""];
    case "establishLore": return [d.content, ...d.keys];
    case "setFlag": return typeof d.value === "string" ? [d.value] : [];
    case "openThread": return [d.summary];
    case "advanceThread": return [d.summary ?? ""];
    case "setFact": return [d.value];
    case "fleshObject": return [d.state ?? "", d.name ?? ""];
    case "fleshCharacter": return [d.description, d.goal ?? ""];
    default: return [];
  }
}

/**
 * Red-line fallback: conservative keyword substring screening over a delta's
 * free text. Blocks only on a **literal hit** of a red-line entry — prose-style
 * red lines (full sentences) won't misfire on a legitimate delta; semantic-level
 * constraints are left to the reactor prompt (soft constraints).
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

/** Physical causality: is there a locked door in the `from` location that gates passage to toId? Returns the blocking door (or null). */
function lockedDoorBlocking(state: WorldState, from: WorldState["locations"][string] | undefined, toId: string) {
  if (!from) return null;
  for (const oid of from.objectIds) {
    const o = state.objects[oid];
    if (o?.props?.locked === true && o.props.gates === toId) return o;
  }
  return null;
}

/** Hardness tier ordering (for comparison). */
const HARDNESS_RANK: Record<Hardness, number> = { ambient: 0, anchored: 1, core: 2 };
const HARDNESS_BY_RANK: Hardness[] = ["ambient", "anchored", "core"];

function maxHardness(a: Hardness, b: Hardness): Hardness {
  return HARDNESS_BY_RANK[Math.max(HARDNESS_RANK[a], HARDNESS_RANK[b])];
}

const OBJECT_LOCATION_FACT_FIELDS = new Set(["location", "where", "place", "hidden", "位置", "所在", "隐藏"]);
const OBJECT_STATE_FACT_FIELDS = new Set(["state", "condition", "light", "locked", "open", "状态", "灯", "锁"]);

const STATE_CONTRADICTION_PAIRS: Array<{ state: RegExp; contradiction: RegExp }> = [
  { state: /空|empty/, contradiction: /满|盛满|装满|倒满|斟满|full/ },
  { state: /满|盛满|装满|倒满|斟满|full/, contradiction: /空|empty/ },
  { state: /破|碎|裂|坏|损毁|broken/, contradiction: /完好|完整|无损|崭新|intact/ },
  { state: /完好|完整|无损|崭新|intact/, contradiction: /破|碎|裂|坏|损毁|broken/ },
  { state: /湿|潮|淋湿|wet/, contradiction: /干|干燥|dry/ },
  { state: /干|干燥|dry/, contradiction: /湿|潮|淋湿|wet/ },
  { state: /关着|关闭|合上|锁着|locked|closed/, contradiction: /打开|敞开|解锁|unlocked|open/ },
  { state: /开着|打开|敞开|解锁|unlocked|open/, contradiction: /关着|关闭|合上|锁着|locked|closed/ },
  { state: /熄灭|不亮|暗着|unlit|off/, contradiction: /亮起|点亮|明亮|lit|on/ },
  { state: /亮起|点亮|明亮|lit|on/, contradiction: /熄灭|不亮|暗着|unlit|off/ },
  { state: /受伤|负伤|流血|injured|wounded/, contradiction: /无伤|毫发无伤|完好|健康|healthy|unharmed/ },
  { state: /无伤|毫发无伤|完好|健康|healthy|unharmed/, contradiction: /受伤|负伤|流血|injured|wounded/ },
];

function mentionsLocation(value: string, loc: WorldState["locations"][string]): boolean {
  const lower = value.toLowerCase();
  return [loc.id, loc.name, loc.gist].filter(Boolean).some((token) => lower.includes(token.toLowerCase()));
}

function protectedObjectLocationConflict(state: WorldState, objectId: string, toLocationId: string) {
  const obj = state.objects[objectId];
  const target = state.locations[toLocationId];
  if (!obj || !target) return null;

  const protectedFacts = (state.facts ?? []).filter(
    (fact) =>
      fact.entityId === objectId &&
      HARDNESS_RANK[fact.hardness] >= HARDNESS_RANK.anchored &&
      OBJECT_LOCATION_FACT_FIELDS.has(fact.field),
  );

  for (const fact of protectedFacts) {
    if (mentionsLocation(fact.value, target)) continue;
    if (fact.field === "hidden" && obj.locationId === toLocationId) continue;
    return fact;
  }
  return null;
}

function stateTextConsistent(factValue: string, proposedState: string): boolean {
  const fact = factValue.toLowerCase();
  const proposed = proposedState.toLowerCase();
  return fact.includes(proposed) || proposed.includes(fact);
}

function stateTextContradicts(factValue: string, proposedState: string): boolean {
  const fact = factValue.toLowerCase();
  const proposed = proposedState.toLowerCase();
  return STATE_CONTRADICTION_PAIRS.some((pair) => pair.state.test(fact) && pair.contradiction.test(proposed));
}

function protectedEntityStateConflict(state: WorldState, entityId: string, proposedState: string) {
  const protectedFacts = (state.facts ?? []).filter((fact) => {
    const field = fact.field.toLowerCase();
    return fact.entityId === entityId && HARDNESS_RANK[fact.hardness] >= HARDNESS_RANK.anchored && OBJECT_STATE_FACT_FIELDS.has(field);
  });

  for (const fact of protectedFacts) {
    if (stateTextConsistent(fact.value, proposedState)) continue;
    if (stateTextContradicts(fact.value, proposedState)) return fact;
  }
  return null;
}

/** Pressure-line "strong consequence" intensity threshold (§5.2 fairness rule). */
const STRONG_THREAD_INTENSITY = 8;

/**
 * Highest hardness a source may write (§5.1 authority grading): only god edits
 * can write/change core; every other source (reactor/character/offstage/flesh/
 * materializer/director/user) writes at most up to anchored.
 * "Raising authority never bypasses the write gate" — enforced here once the gate
 * passes the source in.
 */
const SOURCE_MAX_HARDNESS: Record<DeltaSource, Hardness> = {
  user: "anchored",
  reactor: "anchored",
  director: "anchored",
  offscreen: "anchored",
  flesh: "anchored",
  materializer: "anchored",
  god: "core",
};

/** Guards immutable red lines, structural integrity, and spatial rules; state itself varies freely. When source is provided, adds authority validation. */
export function validateDelta(state: WorldState, rules: WorldRules, d: Delta, source?: DeltaSource): Validation {
  const screened = screenRedLines(rules.redLines, d);
  if (!screened.ok) return screened;
  switch (d.kind) {
    case "moveCharacter": {
      if (!state.roster[d.characterId]) return { ok: false, reason: `角色 ${d.characterId} 不存在` };
      const here = Object.values(state.locations).find((l) => l.presentCharacterIds.includes(d.characterId));
      if (!state.locations[d.toLocationId]) return { ok: false, reason: `目标场景 ${d.toLocationId} 不存在` };
      if (!here) return { ok: true };
      if (!here.connections.includes(d.toLocationId) && here.id !== d.toLocationId)
        return { ok: false, reason: `${here.id} 与 ${d.toLocationId} 不相连` };
      {
        const door = lockedDoorBlocking(state, here, d.toLocationId);
        if (door) return { ok: false, reason: `${door.name} 锁着，过不去` };
      }
      return { ok: true };
    }
    case "setObjectState": {
      const o = state.objects[d.objectId];
      if (!o) return { ok: false, reason: `对象 ${d.objectId} 不存在` };
      if (o.state === d.state) return { ok: false, reason: `对象 ${d.objectId} 状态未变(空操作)` };
      {
        const conflict = protectedEntityStateConflict(state, d.objectId, d.state);
        if (conflict) return { ok: false, reason: `状态会与受保护事实「${conflict.field}=${conflict.value}」(${conflict.hardness})冲突,需先修订事实` };
      }
      return { ok: true };
    }
    case "setFlag":
      return d.key ? { ok: true } : { ok: false, reason: "flag key 为空" };
    case "setTension":
      if (!Number.isFinite(d.value)) return { ok: false, reason: "tension 必须是有限数字" };
      if (d.value < 0 || d.value > 10) return { ok: false, reason: "tension 必须在 0..10" };
      if ((state.tension ?? 0) === d.value) return { ok: false, reason: "tension 未变(空操作)" };
      return { ok: true };
    case "advanceTime":
      return { ok: true };
    case "setCondition": {
      const ent = state.roster[d.entityId];
      if (!ent) return { ok: false, reason: `实体 ${d.entityId} 不在名册中` };
      if (ent.condition === d.condition) return { ok: false, reason: `实体 ${d.entityId} 体态未变(空操作)` };
      {
        const conflict = protectedEntityStateConflict(state, d.entityId, d.condition);
        if (conflict) return { ok: false, reason: `体态会与受保护事实「${conflict.field}=${conflict.value}」(${conflict.hardness})冲突,需先修订事实` };
      }
      return { ok: true };
    }
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
      {
        const conflict = protectedObjectLocationConflict(state, d.objectId, d.toLocationId);
        if (conflict) return { ok: false, reason: `移动会与受保护事实「${conflict.field}=${conflict.value}」(${conflict.hardness})冲突,需先修订事实` };
      }
      // Physical causality: an object explicitly marked non-portable can't be moved (movable by default).
      if (obj.props?.portable === false)
        return { ok: false, reason: `${obj.name} 搬不动` };
      return { ok: true };
    }
    case "setObjectLocked": {
      const o = state.objects[d.objectId];
      if (!o) return { ok: false, reason: `对象 ${d.objectId} 不存在` };
      if ((o.props?.locked ?? false) === d.locked) return { ok: false, reason: `对象 ${d.objectId} 锁态未变(空操作)` };
      return { ok: true };
    }
    case "fleshLocation":
      if (!state.locations[d.locationId]) return { ok: false, reason: `地点 ${d.locationId} 不存在` };
      if (!d.description?.trim()) return { ok: false, reason: "充实描述不能为空" };
      return { ok: true };
    case "openThread": {
      if (!d.id?.trim()) return { ok: false, reason: "压力线 id 不能为空" };
      if ((state.pressureLines ?? []).some((p) => p.id === d.id)) return { ok: false, reason: `压力线 ${d.id} 已存在` };
      if (!d.summary?.trim()) return { ok: false, reason: "压力线摘要不能为空" };
      return { ok: true };
    }
    case "advanceThread": {
      const line = (state.pressureLines ?? []).find((p) => p.id === d.id);
      if (!line) return { ok: false, reason: `压力线 ${d.id} 不存在` };
      // Fairness rule (§5.2): a thread the player doesn't yet know about must not be advanced to "strong consequence" intensity.
      const resultIntensity = Math.max(0, Math.min(10, line.intensity + (d.intensityDelta ?? 0)));
      const resultKnown = d.playerKnown ?? line.playerKnown ?? false;
      if (resultIntensity >= STRONG_THREAD_INTENSITY && !resultKnown) {
        return { ok: false, reason: "公平:玩家尚不知情,压力线不能升到强后果(需先给出征兆)" };
      }
      return { ok: true };
    }
    case "resolveThread": {
      const p = (state.pressureLines ?? []).find((x) => x.id === d.id);
      if (!p) return { ok: false, reason: `压力线 ${d.id} 不存在` };
      if (p.status === "resolved") return { ok: false, reason: `压力线 ${d.id} 已了结(空操作)` };
      return { ok: true };
    }
    case "setFact": {
      if (!d.id?.trim()) return { ok: false, reason: "事实 id 不能为空" };
      if (!d.field?.trim()) return { ok: false, reason: "事实 field 不能为空" };
      if (!d.value?.trim()) return { ok: false, reason: "事实 value 不能为空" };
      const proposed: Hardness = d.hardness ?? "ambient";
      // Authority grading: a source can't write a hardness beyond its permission (only god can set/change core).
      if (source && HARDNESS_RANK[proposed] > HARDNESS_RANK[SOURCE_MAX_HARDNESS[source]]) {
        return { ok: false, reason: `来源 ${source} 无权写入 ${proposed} 级事实` };
      }
      // Canon hardness: anchored/core facts are player- or author-established
      // truth. Non-god proposals cannot revise them, even at equal hardness.
      const existing = (state.facts ?? []).find((f) => f.entityId === d.entityId && f.field === d.field);
      if (existing && existing.value !== d.value) {
        if (HARDNESS_RANK[existing.hardness] >= HARDNESS_RANK.anchored && source !== "god") {
          return { ok: false, reason: `与受保护事实「${d.field}=${existing.value}」(${existing.hardness})冲突,只有 god 可修订` };
        }
        if (HARDNESS_RANK[existing.hardness] > HARDNESS_RANK[proposed]) {
          return { ok: false, reason: `与更硬的事实「${d.field}=${existing.value}」(${existing.hardness})冲突,不可推翻` };
        }
      }
      return { ok: true };
    }
    case "fleshObject": {
      const o = state.objects[d.objectId];
      if (!o) return { ok: false, reason: `对象 ${d.objectId} 不存在` };
      if (o.detail !== "stub") return { ok: false, reason: `对象 ${d.objectId} 已是 fleshed(无需充实)` };
      return { ok: true };
    }
    case "fleshCharacter": {
      const c = state.characters?.[d.characterId];
      if (!c) return { ok: false, reason: `实例角色 ${d.characterId} 不存在` };
      if (c.detail !== "stub") return { ok: false, reason: `角色 ${d.characterId} 已是 fleshed(无需充实)` };
      if (!d.description?.trim()) return { ok: false, reason: "角色充实描述不能为空" };
      return { ok: true };
    }
    case "retireEntity": {
      if (d.entityType === "character") {
        const c = state.characters?.[d.entityId];
        const inRoster = !!state.roster[d.entityId];
        if (!c && !inRoster) return { ok: false, reason: `角色 ${d.entityId} 不存在` };
        if (c?.archived) return { ok: false, reason: `角色 ${d.entityId} 已归档(空操作)` };
        return { ok: true };
      }
      const o = state.objects[d.entityId];
      if (!o) return { ok: false, reason: `对象 ${d.entityId} 不存在` };
      if (o.archived) return { ok: false, reason: `对象 ${d.entityId} 已归档(空操作)` };
      return { ok: true };
    }
    default:
      return { ok: false, reason: `未知 delta kind: ${(d as { kind?: string }).kind ?? ""}` };
  }
}

/** Immutable apply; the caller should validateDelta first. */
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
    case "setTension":
      return { ...state, tension: d.value };
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
    case "openThread": {
      const line = {
        id: d.id,
        summary: d.summary,
        status: "active" as const,
        intensity: Math.max(0, Math.min(10, d.intensity ?? 3)),
        ...(d.relatedCharacterIds ? { relatedCharacterIds: d.relatedCharacterIds } : {}),
        ...(d.relatedLocationIds ? { relatedLocationIds: d.relatedLocationIds } : {}),
        ...(d.threadKind ? { kind: d.threadKind } : {}),
        ...(d.playerKnown !== undefined ? { playerKnown: d.playerKnown } : {}),
        ...(d.nextSign ? { nextSign: d.nextSign } : {}),
        updatedDay: state.time.day,
      };
      return { ...state, pressureLines: [...(state.pressureLines ?? []), line] };
    }
    case "advanceThread": {
      const lines = (state.pressureLines ?? []).map((p) => {
        if (p.id !== d.id) return p;
        return {
          ...p,
          intensity: Math.max(0, Math.min(10, p.intensity + (d.intensityDelta ?? 0))),
          summary: d.summary ?? p.summary,
          status: d.status ?? p.status,
          ...(d.playerKnown !== undefined ? { playerKnown: d.playerKnown } : {}),
          ...(d.nextSign ? { nextSign: d.nextSign } : {}),
          updatedDay: state.time.day,
        };
      });
      return { ...state, pressureLines: lines };
    }
    case "resolveThread": {
      const lines = (state.pressureLines ?? []).map((p) =>
        p.id === d.id ? { ...p, status: "resolved" as const, updatedDay: state.time.day } : p,
      );
      return { ...state, pressureLines: lines };
    }
    case "setFact": {
      const proposed: Hardness = d.hardness ?? "ambient";
      const existing = (state.facts ?? []).find((f) => f.entityId === d.entityId && f.field === d.field);
      const hardness = existing && existing.value === d.value ? maxHardness(existing.hardness, proposed) : proposed;
      const playerKnown = d.playerKnown ?? (existing?.value === d.value ? existing.playerKnown : undefined);
      const fact = {
        id: d.id,
        field: d.field,
        value: d.value,
        hardness,
        sinceDay: state.time.day,
        ...(d.entityId ? { entityId: d.entityId } : {}),
        ...(playerKnown !== undefined ? { playerKnown } : {}),
      };
      // Upsert by (entityId, field): the "truth right now" for this dimension is single-valued.
      const rest = (state.facts ?? []).filter((f) => !(f.entityId === d.entityId && f.field === d.field));
      return { ...state, facts: [...rest, fact] };
    }
    case "fleshObject": {
      const o = state.objects[d.objectId];
      return {
        ...state,
        objects: { ...state.objects, [d.objectId]: { ...o, detail: "fleshed", ...(d.name ? { name: d.name } : {}), ...(d.state !== undefined ? { state: d.state } : {}) } },
      };
    }
    case "fleshCharacter": {
      const c = state.characters![d.characterId];
      return {
        ...state,
        characters: { ...state.characters, [d.characterId]: { ...c, detail: "fleshed", description: d.description, ...(d.goal ? { goal: d.goal } : {}) } },
      };
    }
    case "retireEntity": {
      if (d.entityType === "character") {
        const c = state.characters?.[d.entityId];
        // Remove from every location's present roster, but keep the character record (set archived true); never delete.
        const locations: WorldState["locations"] = {};
        for (const [id, loc] of Object.entries(state.locations)) {
          locations[id] = { ...loc, presentCharacterIds: loc.presentCharacterIds.filter((x) => x !== d.entityId) };
        }
        return {
          ...state,
          locations,
          ...(c ? { characters: { ...state.characters, [d.entityId]: { ...c, archived: true } } } : {}),
        };
      }
      const o = state.objects[d.entityId];
      const locations: WorldState["locations"] = {};
      for (const [id, loc] of Object.entries(state.locations)) {
        locations[id] = { ...loc, objectIds: loc.objectIds.filter((x) => x !== d.entityId) };
      }
      return {
        ...state,
        locations,
        objects: { ...state.objects, [d.entityId]: { ...o, archived: true } },
      };
    }
  }
}
