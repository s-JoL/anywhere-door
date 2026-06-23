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
  it("rejects setting state of a nonexistent object", () => {
    const r = validateDelta(baseState(), rules, { kind: "setObjectState", objectId: "nope", state: "碎了" });
    expect(r.ok).toBe(false);
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

  it("applyDelta: sets relationship immutably", () => {
    const start: WorldState = { ...relBaseState(), relationships: undefined };
    const result = applyDelta(start, { kind: "setRelationship", fromId: "c-lan", toId: "you", disposition: "记恨在心" });
    expect(result.relationships?.["c-lan"]?.["you"]).toBe("记恨在心");
    expect(start.relationships).toBeUndefined();
  });

  it("applyDelta: preserves existing relationships", () => {
    const start: WorldState = {
      ...relBaseState(),
      roster: { "c-lan": { name: "兰" }, "you": { name: "你" }, "c-zhou": { name: "周" } },
      relationships: { "c-lan": { "you": "戒备" } },
    };
    const result = applyDelta(start, { kind: "setRelationship", fromId: "c-lan", toId: "c-zhou", disposition: "欠了人情" });
    expect(result.relationships?.["c-lan"]?.["you"]).toBe("戒备");
    expect(result.relationships?.["c-lan"]?.["c-zhou"]).toBe("欠了人情");
  });
});

describe("establishCharacter", () => {
  it("validateDelta rejects empty name", () => {
    const r = validateDelta(baseState(), rules, { kind: "establishCharacter", id: "c-new", name: "", locationId: "bar" });
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
    expect(s.locations.bar.presentCharacterIds).toEqual(["c1"]); // 原对象未变
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
