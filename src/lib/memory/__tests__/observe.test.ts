import { describe, it, expect } from "vitest";
import { buildObservations, defaultImportance, buildSelfMemory } from "../observe";
import type { WorldState } from "../../types";

describe("buildSelfMemory (evidence → memory)", () => {
  it("builds an observation memory for one character with keywords and importance", () => {
    const m = buildSelfMemory("c-lan", "（我记下）那人拿走了我的剑", 6);
    expect(m.charId).toBe("c-lan");
    expect(m.kind).toBe("observation");
    expect(m.text).toContain("拿走了我的剑");
    expect(m.importance).toBe(6);
    expect(Array.isArray(m.keywords)).toBe(true);
  });
});

function state(): WorldState {
  return {
    currentLocationId: "bar",
    time: { day: 1, clock: "深夜", lighting: "冷光" },
    locations: {
      bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: ["alley"], presentCharacterIds: ["c-lan", "c-zhou"], objectIds: [] },
      alley: { id: "alley", name: "后巷", detail: "stub", gist: "", connections: ["bar"], presentCharacterIds: ["c-mei"], objectIds: [] },
    },
    objects: {},
    roster: { "c-lan": { name: "阿岚" }, "c-zhou": { name: "老周" }, "c-mei": { name: "阿梅" } },
    flags: {},
  };
}

describe("buildObservations (witness-scoped)", () => {
  it("writes one observation per present character, and NOT to absent characters", () => {
    const obs = buildObservations(state(), { speakerName: "你", text: "我把枪放在吧台上" });
    const charIds = obs.map((m) => m.charId).sort();
    expect(charIds).toEqual(["c-lan", "c-zhou"]); // the two present characters
    expect(charIds).not.toContain("c-mei");        // 阿梅/c-mei in the back alley can't perceive it → subjective isolation
    expect(obs[0].text).toContain("你");
    expect(obs[0].text).toContain("枪");
    expect(obs[0].keywords.length).toBeGreaterThan(0);
    expect(obs[0].importance).toBeGreaterThanOrEqual(1);
    expect(obs[0].importance).toBeLessThanOrEqual(10);
  });

  it("defaultImportance scores action/charged lines above idle chatter", () => {
    expect(defaultImportance("（拔出枪指着你）你敢动试试")).toBeGreaterThan(defaultImportance("嗯。"));
  });
});
