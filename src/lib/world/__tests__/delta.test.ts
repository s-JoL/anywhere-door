import { describe, it, expect } from "vitest";
import { validateDelta, applyDelta } from "../delta";
import type { WorldState, WorldRules } from "../../types";

const rules: WorldRules = { physics: "无超自然", setting: "现代酒馆", redLines: [] };

function baseState(): WorldState {
  return {
    currentLocationId: "bar",
    time: { day: 1, clock: "黄昏", lighting: "暖橙" },
    locations: {
      bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: ["street"], presentCharacterIds: ["c1"], objectIds: ["glass"] },
      street: { id: "street", name: "街道", detail: "stub", gist: "湿漉漉的街", connections: ["bar"], presentCharacterIds: [], objectIds: [] },
    },
    objects: { glass: { id: "glass", name: "酒杯", detail: "fleshed", props: {}, locationId: "bar", state: "空" } },
    roster: { c1: { name: "阿岚" } },
    flags: {},
  };
}

describe("validateDelta", () => {
  it("rejects an unknown delta kind instead of falling through", () => {
    const r = validateDelta(baseState(), rules, { kind: "unknownDelta", id: "x" } as never);
    expect(r).toEqual({ ok: false, reason: "未知 delta kind: unknownDelta" });
  });

  it("rejects moving an absent character", () => {
    const r = validateDelta(baseState(), rules, { kind: "moveCharacter", characterId: "ghost", toLocationId: "street" });
    expect(r.ok).toBe(false);
  });
  it("rejects moving to an unconnected location", () => {
    const s = baseState();
    s.locations.bar.connections = [];
    const r = validateDelta(s, rules, { kind: "moveCharacter", characterId: "c1", toLocationId: "street" });
    expect(r.ok).toBe(false);
  });
  it("accepts a valid move", () => {
    const r = validateDelta(baseState(), rules, { kind: "moveCharacter", characterId: "c1", toLocationId: "street" });
    expect(r.ok).toBe(true);
  });
  it("accepts moving a rostered offstage character into the current scene through the gate", () => {
    const s = baseState();
    s.roster["c-off"] = { name: "迟到的人" };
    const r = validateDelta(s, rules, { kind: "moveCharacter", characterId: "c-off", toLocationId: "bar" });
    expect(r.ok).toBe(true);
    const next = applyDelta(s, { kind: "moveCharacter", characterId: "c-off", toLocationId: "bar" });
    expect(next.locations.bar.presentCharacterIds).toContain("c-off");
  });
  it("validates tension as a real durable world-state delta", () => {
    const s = baseState();
    expect(validateDelta(s, rules, { kind: "setTension", value: 3 }).ok).toBe(true);
    expect(applyDelta(s, { kind: "setTension", value: 3 }).tension).toBe(3);
    expect(validateDelta({ ...s, tension: 3 }, rules, { kind: "setTension", value: 3 }).ok).toBe(false);
    expect(validateDelta(s, rules, { kind: "setTension", value: -1 }).ok).toBe(false);
  });
  it("rejects setting state of a nonexistent object", () => {
    const r = validateDelta(baseState(), rules, { kind: "setObjectState", objectId: "nope", state: "碎了" });
    expect(r.ok).toBe(false);
  });
  it("rejects object state changes that contradict an anchored state fact until the fact is revised", () => {
    const s = baseState();
    s.facts = [{ id: "f-glass-empty", entityId: "glass", field: "state", value: "空的", hardness: "anchored" }];

    expect(validateDelta(s, rules, { kind: "setObjectState", objectId: "glass", state: "盛满了酒" }, "reactor").ok).toBe(false);

    const revised = applyDelta(s, { kind: "setFact", id: "f-glass-full", entityId: "glass", field: "state", value: "盛满", hardness: "anchored" });
    expect(validateDelta(revised, rules, { kind: "setObjectState", objectId: "glass", state: "盛满了酒" }, "god").ok).toBe(true);
  });
  it("rejects no-op deltas that change nothing (phantom changes)", () => {
    const s = baseState(); // glass.state="空" (empty), c1 has no condition
    expect(validateDelta(s, rules, { kind: "setObjectState", objectId: "glass", state: "空" }).ok).toBe(false);
    expect(validateDelta(s, rules, { kind: "setObjectState", objectId: "glass", state: "碎了" }).ok).toBe(true); // a real change is still valid
    s.roster.c1.condition = "受伤";
    expect(validateDelta(s, rules, { kind: "setCondition", entityId: "c1", condition: "受伤" }).ok).toBe(false);
    s.objects.glass.props = { locked: true };
    expect(validateDelta(s, rules, { kind: "setObjectLocked", objectId: "glass", locked: true }).ok).toBe(false);
    expect(validateDelta(s, rules, { kind: "setObjectLocked", objectId: "glass", locked: false }).ok).toBe(true);
  });

  it("rejects setCondition changes that contradict an anchored condition fact until the fact is revised", () => {
    const s = baseState();
    s.facts = [{ id: "f-c1-injured", entityId: "c1", field: "condition", value: "受伤", hardness: "anchored" }];

    expect(validateDelta(s, rules, { kind: "setCondition", entityId: "c1", condition: "毫发无伤" }, "reactor").ok).toBe(false);

    const revised = applyDelta(s, { kind: "setFact", id: "f-c1-healed", entityId: "c1", field: "condition", value: "毫发无伤", hardness: "anchored" });
    expect(validateDelta(revised, rules, { kind: "setCondition", entityId: "c1", condition: "毫发无伤" }, "god").ok).toBe(true);
  });

  it("accepts a fresh establishLore", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishLore", id: "l1", keys: ["血誓录"], content: "一本禁书" });
    expect(r.ok).toBe(true);
  });

  it("rejects establishLore with a duplicate id", () => {
    const s = baseState();
    s.lore = [{ id: "l1", keys: ["旧"], content: "旧设定" }];
    const r = validateDelta(s, rules, { kind: "establishLore", id: "l1", keys: ["血誓录"], content: "一本禁书" });
    expect(r.ok).toBe(false);
  });

  it("rejects establishLore with empty keys", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishLore", id: "l1", keys: [], content: "一本禁书" });
    expect(r.ok).toBe(false);
  });

  it("rejects establishLore with empty content", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishLore", id: "l1", keys: ["血誓录"], content: "" });
    expect(r.ok).toBe(false);
  });
});

describe("validateDelta red-line screen", () => {
  const banned: WorldRules = { physics: "无超自然", setting: "现代酒馆", redLines: ["死亡", "魔法"] };

  it("rejects a setCondition whose free text literally contains a red-line term", () => {
    const r = validateDelta(baseState(), banned, { kind: "setCondition", entityId: "c1", condition: "中枪后死亡" });
    expect(r.ok).toBe(false);
  });

  it("rejects establishLore content that hits a red-line term", () => {
    const r = validateDelta(baseState(), banned, { kind: "establishLore", id: "l1", keys: ["秘术"], content: "她会魔法" });
    expect(r.ok).toBe(false);
  });

  it("rejects setObjectState carrying a banned term", () => {
    const r = validateDelta(baseState(), banned, { kind: "setObjectState", objectId: "glass", state: "被魔法点燃" });
    expect(r.ok).toBe(false);
  });

  it("allows an otherwise-valid delta when red lines are prose that does not literally match", () => {
    const prose: WorldRules = { physics: "无超自然", setting: "现代酒馆", redLines: ["任何角色都不会真正死亡"] };
    const r = validateDelta(baseState(), prose, { kind: "setCondition", entityId: "c1", condition: "疲惫不堪" });
    expect(r.ok).toBe(true);
  });

  it("does not fire when red lines are empty (existing behavior unchanged)", () => {
    const r = validateDelta(baseState(), rules, { kind: "setCondition", entityId: "c1", condition: "死亡的气息" });
    expect(r.ok).toBe(true);
  });
});

describe("applyDelta establishLore", () => {
  it("appends a lore entry immutably without mutating the original", () => {
    const s = baseState();
    const next = applyDelta(s, { kind: "establishLore", id: "l1", keys: ["血誓录"], content: "一本禁书" });
    expect(next.lore).toEqual([{ id: "l1", keys: ["血誓录"], content: "一本禁书" }]);
    expect(s.lore).toBeUndefined();
    expect(next).not.toBe(s);
  });

  it("appends to existing lore preserving prior entries", () => {
    const s = baseState();
    s.lore = [{ id: "l0", keys: ["孤山"], content: "孤山苦寒" }];
    const next = applyDelta(s, { kind: "establishLore", id: "l1", keys: ["血誓录"], content: "一本禁书" });
    expect(next.lore?.map((e) => e.id)).toEqual(["l0", "l1"]);
    expect(s.lore).toHaveLength(1); // original untouched
  });
});

describe("setCondition", () => {
  it("validateDelta rejects if entityId not in roster", () => {
    const r = validateDelta(baseState(), rules, { kind: "setCondition", entityId: "ghost", condition: "受伤" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta accepts if entityId in roster", () => {
    const r = validateDelta(baseState(), rules, { kind: "setCondition", entityId: "c1", condition: "浑身湿透" });
    expect(r.ok).toBe(true);
  });
  it("applyDelta sets condition immutably", () => {
    const s = baseState();
    const next = applyDelta(s, { kind: "setCondition", entityId: "c1", condition: "浑身湿透" });
    expect(s.roster.c1.condition).toBeUndefined(); // original unchanged
    expect(next.roster.c1.condition).toBe("浑身湿透");
  });
  it("applyDelta overwrites existing condition", () => {
    const s = baseState();
    const first = applyDelta(s, { kind: "setCondition", entityId: "c1", condition: "轻伤" });
    const second = applyDelta(first, { kind: "setCondition", entityId: "c1", condition: "重伤" });
    expect(second.roster.c1.condition).toBe("重伤");
  });
});

describe("establishObject", () => {
  it("validateDelta rejects if locationId missing", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishObject", id: "new-obj", name: "匕首", locationId: "nowhere" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta rejects if id already exists in objects", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishObject", id: "glass", name: "酒杯", locationId: "bar" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta accepts valid new object", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishObject", id: "new-knife", name: "匕首", locationId: "bar" });
    expect(r.ok).toBe(true);
  });
  it("applyDelta adds object to state.objects with correct fields", () => {
    const s = baseState();
    const next = applyDelta(s, { kind: "establishObject", id: "new-knife", name: "匕首", locationId: "bar", state: "锋利" });
    expect(next.objects["new-knife"]).toMatchObject({
      id: "new-knife",
      name: "匕首",
      detail: "fleshed",
      props: {},
      locationId: "bar",
      state: "锋利",
    });
  });
  it("applyDelta pushes id into locations[locationId].objectIds", () => {
    const s = baseState();
    const next = applyDelta(s, { kind: "establishObject", id: "new-knife", name: "匕首", locationId: "bar" });
    expect(next.locations.bar.objectIds).toContain("new-knife");
  });
  it("applyDelta does NOT mutate input state", () => {
    const s = baseState();
    const originalLen = s.locations.bar.objectIds.length;
    applyDelta(s, { kind: "establishObject", id: "new-knife", name: "匕首", locationId: "bar" });
    expect(s.locations.bar.objectIds.length).toBe(originalLen);
  });
});

describe("establishLocation", () => {
  it("validateDelta rejects if id already exists in locations", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishLocation", id: "bar", name: "酒馆" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta rejects if connectFrom location does not exist", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishLocation", id: "backroom", name: "里屋", connectFrom: "nowhere" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta accepts valid new location (connectFrom defaults to currentLocationId)", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishLocation", id: "backroom", name: "里屋" });
    expect(r.ok).toBe(true);
  });
  it("validateDelta accepts valid new location with explicit connectFrom", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishLocation", id: "backroom", name: "里屋", connectFrom: "street" });
    expect(r.ok).toBe(true);
  });
  it("applyDelta adds new location with correct fields", () => {
    const s = baseState();
    const next = applyDelta(s, { kind: "establishLocation", id: "backroom", name: "里屋", gist: "昏暗内室", description: "破旧木床和一扇窗" });
    expect(next.locations["backroom"]).toMatchObject({
      id: "backroom",
      name: "里屋",
      detail: "fleshed",
      gist: "昏暗内室",
      description: "破旧木床和一扇窗",
      presentCharacterIds: [],
      objectIds: [],
    });
    expect(next.locations["backroom"].connections).toContain("bar");
  });
  it("applyDelta adds bidirectional connection (from → new AND new → from)", () => {
    const s = baseState();
    const next = applyDelta(s, { kind: "establishLocation", id: "backroom", name: "里屋", connectFrom: "bar" });
    expect(next.locations["backroom"].connections).toContain("bar");
    expect(next.locations["bar"].connections).toContain("backroom");
  });
  it("applyDelta does not duplicate connection if already present", () => {
    const s = baseState();
    // Apply twice — second time won't push dup because validateDelta rejects existing id,
    // but test that the connections array has no duplicates after a single apply
    const next = applyDelta(s, { kind: "establishLocation", id: "backroom", name: "里屋" });
    const barConns = next.locations["bar"].connections.filter((c) => c === "backroom");
    expect(barConns).toHaveLength(1);
  });
  it("applyDelta does NOT mutate input state", () => {
    const s = baseState();
    const originalConns = [...s.locations.bar.connections];
    applyDelta(s, { kind: "establishLocation", id: "backroom", name: "里屋" });
    expect(s.locations.bar.connections).toEqual(originalConns);
    expect(s.locations["backroom"]).toBeUndefined();
  });
});

describe("moveScene", () => {
  it("validateDelta rejects if toLocationId does not exist", () => {
    const r = validateDelta(baseState(), rules, { kind: "moveScene", toLocationId: "nowhere" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta rejects if toLocationId is not connected to current location", () => {
    const s = baseState();
    // Add an unconnected location
    s.locations["isolated"] = { id: "isolated", name: "孤岛", detail: "stub", gist: "", connections: [], presentCharacterIds: [], objectIds: [] };
    const r = validateDelta(s, rules, { kind: "moveScene", toLocationId: "isolated" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta accepts moving to the current location (no-op)", () => {
    const r = validateDelta(baseState(), rules, { kind: "moveScene", toLocationId: "bar" });
    expect(r.ok).toBe(true);
  });
  it("validateDelta accepts moving to a connected location", () => {
    const r = validateDelta(baseState(), rules, { kind: "moveScene", toLocationId: "street" });
    expect(r.ok).toBe(true);
  });
  it("applyDelta sets currentLocationId", () => {
    const s = baseState();
    const next = applyDelta(s, { kind: "moveScene", toLocationId: "street" });
    expect(next.currentLocationId).toBe("street");
  });
  it("applyDelta does NOT mutate input state", () => {
    const s = baseState();
    applyDelta(s, { kind: "moveScene", toLocationId: "street" });
    expect(s.currentLocationId).toBe("bar");
  });
});

describe("setRelationship delta", () => {
  function relBaseState(): WorldState {
    return {
      currentLocationId: "bar",
      time: { day: 1, clock: "黄昏", lighting: "暖橙" },
      locations: {
        bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: [], presentCharacterIds: ["c-lan", "you"], objectIds: [] },
      },
      objects: {},
      roster: { "c-lan": { name: "兰" }, "you": { name: "你" } },
      flags: {},
    };
  }

  it("validate: accepts valid setRelationship", () => {
    const d = { kind: "setRelationship" as const, fromId: "c-lan", toId: "you", disposition: "戒备松动" };
    const r = validateDelta(relBaseState(), rules, d);
    expect(r.ok).toBe(true);
  });

  it("validate: rejects unknown fromId", () => {
    const d = { kind: "setRelationship" as const, fromId: "ghost", toId: "you", disposition: "x" };
    const r = validateDelta(relBaseState(), rules, d);
    expect(r.ok).toBe(false);
  });

  it("validate: rejects unknown toId", () => {
    const d = { kind: "setRelationship" as const, fromId: "c-lan", toId: "ghost", disposition: "x" };
    const r = validateDelta(relBaseState(), rules, d);
    expect(r.ok).toBe(false);
  });

  it("validate: rejects self-relation", () => {
    const d = { kind: "setRelationship" as const, fromId: "c-lan", toId: "c-lan", disposition: "x" };
    const r = validateDelta(relBaseState(), rules, d);
    expect(r.ok).toBe(false);
  });

  it("validate: rejects empty disposition", () => {
    const d = { kind: "setRelationship" as const, fromId: "c-lan", toId: "you", disposition: "" };
    const r = validateDelta(relBaseState(), rules, d);
    expect(r.ok).toBe(false);
  });

  it("validate: accepts you→c-lan", () => {
    const d = { kind: "setRelationship" as const, fromId: "you", toId: "c-lan", disposition: "暗生情愫" };
    const r = validateDelta(relBaseState(), rules, d);
    expect(r.ok).toBe(true);
  });

  it("validate: accepts an affinityDelta-only update (no disposition)", () => {
    const d = { kind: "setRelationship" as const, fromId: "c-lan", toId: "you", affinityDelta: -20, reason: "拿走了我的剑" };
    expect(validateDelta(relBaseState(), rules, d).ok).toBe(true);
  });

  it("applyDelta: builds a structured relationship immutably", () => {
    const start: WorldState = { ...relBaseState(), relationships: undefined };
    const result = applyDelta(start, { kind: "setRelationship", fromId: "c-lan", toId: "you", disposition: "记恨在心" });
    expect(result.relationships?.["c-lan"]?.["you"]?.disposition).toBe("记恨在心");
    expect(start.relationships).toBeUndefined();
  });

  it("applyDelta: affinityDelta + reason accrue into affinity and evidence", () => {
    const start: WorldState = { ...relBaseState(), relationships: undefined };
    const result = applyDelta(start, { kind: "setRelationship", fromId: "c-lan", toId: "you", affinityDelta: -20, reason: "拿走了我的剑" });
    const rel = result.relationships?.["c-lan"]?.["you"];
    expect(rel?.affinity).toBe(-20);
    expect(rel?.evidence).toEqual(["拿走了我的剑"]);
  });

  it("applyDelta: preserves existing relationships", () => {
    const start: WorldState = {
      ...relBaseState(),
      roster: { "c-lan": { name: "兰" }, "you": { name: "你" }, "c-zhou": { name: "周" } },
      relationships: { "c-lan": { "you": { affinity: -10, disposition: "戒备", evidence: [], sinceDay: 1 } } },
    };
    const result = applyDelta(start, { kind: "setRelationship", fromId: "c-lan", toId: "c-zhou", disposition: "欠了人情" });
    expect(result.relationships?.["c-lan"]?.["you"]?.disposition).toBe("戒备");
    expect(result.relationships?.["c-lan"]?.["c-zhou"]?.disposition).toBe("欠了人情");
  });
});

describe("establishCharacter", () => {
  it("validateDelta rejects empty name", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishCharacter", id: "c-new", name: "", locationId: "bar" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta rejects a whitespace-only name", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishCharacter", id: "c-new", name: "   ", locationId: "bar" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta rejects id already in roster (covers seed characters)", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishCharacter", id: "c1", name: "冒牌", locationId: "bar" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta rejects a nonexistent location", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishCharacter", id: "c-new", name: "守卫", locationId: "nowhere" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta accepts a valid new character", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishCharacter", id: "c-new", name: "守卫", role: "门口的守卫", locationId: "bar" });
    expect(r.ok).toBe(true);
  });
  it("applyDelta adds a stub character to state.characters with role→description", () => {
    const next = applyDelta(baseState(), { kind: "establishCharacter", id: "c-new", name: "守卫", role: "门口的守卫", goal: "盘问来客", locationId: "bar" });
    expect(next.characters?.["c-new"]).toMatchObject({
      id: "c-new",
      name: "守卫",
      description: "门口的守卫",
      detail: "stub",
      goal: "盘问来客",
    });
  });
  it("applyDelta registers the character in roster and makes it present", () => {
    const next = applyDelta(baseState(), { kind: "establishCharacter", id: "c-new", name: "守卫", locationId: "bar" });
    expect(next.roster["c-new"]).toEqual({ name: "守卫" });
    expect(next.locations.bar.presentCharacterIds).toContain("c-new");
  });
  it("applyDelta does NOT mutate input state", () => {
    const s = baseState();
    applyDelta(s, { kind: "establishCharacter", id: "c-new", name: "守卫", locationId: "bar" });
    expect(s.characters).toBeUndefined();
    expect(s.roster["c-new"]).toBeUndefined();
    expect(s.locations.bar.presentCharacterIds).not.toContain("c-new");
  });
});

describe("applyDelta (immutable)", () => {
  it("moves a character between locations without mutating input", () => {
    const s = baseState();
    const next = applyDelta(s, { kind: "moveCharacter", characterId: "c1", toLocationId: "street" });
    expect(s.locations.bar.presentCharacterIds).toEqual(["c1"]); // original object unchanged
    expect(next.locations.bar.presentCharacterIds).toEqual([]);
    expect(next.locations.street.presentCharacterIds).toEqual(["c1"]);
  });
  it("sets object state and a flag", () => {
    let next = applyDelta(baseState(), { kind: "setObjectState", objectId: "glass", state: "满" });
    expect(next.objects.glass.state).toBe("满");
    next = applyDelta(next, { kind: "setFlag", key: "metBartender", value: true });
    expect(next.flags.metBartender).toBe(true);
  });
  it("advances time", () => {
    const next = applyDelta(baseState(), { kind: "advanceTime", clock: "深夜", lighting: "幽蓝", dayDelta: 0 });
    expect(next.time.clock).toBe("深夜");
    expect(next.time.lighting).toBe("幽蓝");
  });
  it("setObjectState does not mutate input state", () => {
    const s = baseState();
    applyDelta(s, { kind: "setObjectState", objectId: "glass", state: "满" });
    expect(s.objects.glass.state).toBe("空");
  });
});

describe("moveObject delta (physical causality: objects movable + portable enforced)", () => {
  it("validateDelta accepts relocating a movable object to an existing location", () => {
    const r = validateDelta(baseState(), rules, { kind: "moveObject", objectId: "glass", toLocationId: "street" });
    expect(r.ok).toBe(true);
  });
  it("rejects moving an object against an anchored location fact until the fact is revised", () => {
    const s = baseState();
    s.facts = [{ id: "f-glass-location", entityId: "glass", field: "location", value: "酒馆", hardness: "anchored" }];

    expect(validateDelta(s, rules, { kind: "moveObject", objectId: "glass", toLocationId: "street" }, "reactor").ok).toBe(false);
    expect(validateDelta(s, rules, { kind: "moveObject", objectId: "glass", toLocationId: "street" }, "god").ok).toBe(false);

    const revised = applyDelta(s, { kind: "setFact", id: "f-glass-location-2", entityId: "glass", field: "location", value: "街道", hardness: "anchored" });
    expect(validateDelta(revised, rules, { kind: "moveObject", objectId: "glass", toLocationId: "street" }, "god").ok).toBe(true);
  });
  it("validateDelta rejects a nonexistent object", () => {
    const r = validateDelta(baseState(), rules, { kind: "moveObject", objectId: "ghost", toLocationId: "street" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta rejects a nonexistent target location", () => {
    const r = validateDelta(baseState(), rules, { kind: "moveObject", objectId: "glass", toLocationId: "nowhere" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta rejects moving an object marked portable:false", () => {
    const s = baseState();
    s.objects.glass.props = { portable: false };
    const r = validateDelta(s, rules, { kind: "moveObject", objectId: "glass", toLocationId: "street" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta allows moving when portable is unset (default movable)", () => {
    const s = baseState();
    s.objects.glass.props = {};
    const r = validateDelta(s, rules, { kind: "moveObject", objectId: "glass", toLocationId: "street" });
    expect(r.ok).toBe(true);
  });

  it("applyDelta relocates the object and migrates objectIds across both locations, immutably", () => {
    const s = baseState();
    const next = applyDelta(s, { kind: "moveObject", objectId: "glass", toLocationId: "street" });
    expect(next.objects.glass.locationId).toBe("street");
    expect(next.locations.bar.objectIds).toEqual([]);
    expect(next.locations.street.objectIds).toEqual(["glass"]);
    // original untouched
    expect(s.objects.glass.locationId).toBe("bar");
    expect(s.locations.bar.objectIds).toEqual(["glass"]);
    expect(next).not.toBe(s);
  });
});

describe("locked passage (a locked door blocks movement)", () => {
  // a state where bar has a locked door gating the way to street
  function withDoor(locked: boolean, gates = "street"): WorldState {
    const s = baseState();
    s.objects.door = { id: "door", name: "铁门", detail: "fleshed", props: { locked, gates }, locationId: "bar" };
    s.locations.bar.objectIds = [...s.locations.bar.objectIds, "door"];
    return s;
  }

  it("validateDelta rejects moveScene through a locked door", () => {
    const r = validateDelta(withDoor(true), rules, { kind: "moveScene", toLocationId: "street" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta rejects moveCharacter through a locked door", () => {
    const r = validateDelta(withDoor(true), rules, { kind: "moveCharacter", characterId: "c1", toLocationId: "street" });
    expect(r.ok).toBe(false);
  });
  it("validateDelta allows passage once the door is unlocked", () => {
    expect(validateDelta(withDoor(false), rules, { kind: "moveScene", toLocationId: "street" }).ok).toBe(true);
    expect(validateDelta(withDoor(false), rules, { kind: "moveCharacter", characterId: "c1", toLocationId: "street" }).ok).toBe(true);
  });
  it("a locked door gating a DIFFERENT exit does not block this passage", () => {
    const r = validateDelta(withDoor(true, "elsewhere"), rules, { kind: "moveScene", toLocationId: "street" });
    expect(r.ok).toBe(true);
  });

  it("validateDelta setObjectLocked: accepts existing object, rejects missing", () => {
    expect(validateDelta(withDoor(true), rules, { kind: "setObjectLocked", objectId: "door", locked: false }).ok).toBe(true);
    expect(validateDelta(baseState(), rules, { kind: "setObjectLocked", objectId: "ghost", locked: false }).ok).toBe(false);
  });
  it("applyDelta setObjectLocked toggles props.locked immutably", () => {
    const s = withDoor(true);
    const next = applyDelta(s, { kind: "setObjectLocked", objectId: "door", locked: false });
    expect(next.objects.door.props.locked).toBe(false);
    expect(s.objects.door.props.locked).toBe(true); // original untouched
  });

  it("establishObject can birth a locked door with gates", () => {
    const next = applyDelta(baseState(), { kind: "establishObject", id: "gate", name: "气闸", locationId: "bar", locked: true, gates: "street" });
    expect(next.objects.gate.props).toMatchObject({ locked: true, gates: "street" });
    // and it actually blocks passage
    expect(validateDelta(next, rules, { kind: "moveScene", toLocationId: "street" }).ok).toBe(false);
  });
});

describe("fleshLocation delta (stub→fleshed lazy enrichment)", () => {
  it("validateDelta accepts fleshing an existing location", () => {
    const r = validateDelta(baseState(), rules, { kind: "fleshLocation", locationId: "street", description: "湿漉漉的霓虹长街，雨水在裂缝里聚成一条条细河" });
    expect(r.ok).toBe(true);
  });
  it("validateDelta rejects fleshing a nonexistent location", () => {
    const r = validateDelta(baseState(), rules, { kind: "fleshLocation", locationId: "nowhere", description: "x" });
    expect(r.ok).toBe(false);
  });
  it("applyDelta sets description and marks the location fleshed, immutably", () => {
    const s = baseState();
    expect(s.locations.street.detail).toBe("stub"); // precondition
    const next = applyDelta(s, { kind: "fleshLocation", locationId: "street", description: "霓虹长街", gist: "雨夜长街" });
    expect(next.locations.street.description).toBe("霓虹长街");
    expect(next.locations.street.gist).toBe("雨夜长街");
    expect(next.locations.street.detail).toBe("fleshed");
    // original untouched
    expect(s.locations.street.detail).toBe("stub");
    expect(s.locations.street.description).toBeUndefined();
  });
  it("applyDelta keeps the prior gist when none is given", () => {
    const next = applyDelta(baseState(), { kind: "fleshLocation", locationId: "street", description: "霓虹长街" });
    expect(next.locations.street.gist).toBe("湿漉漉的街"); // prior gist retained
  });
});
