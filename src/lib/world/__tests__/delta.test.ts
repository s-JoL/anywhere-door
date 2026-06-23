import { describe, it, expect } from "vitest";
import { validateDelta, applyDelta, type Delta } from "../delta";
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
