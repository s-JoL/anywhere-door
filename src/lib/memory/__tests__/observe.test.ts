import { describe, it, expect } from "vitest";
import { buildConsequenceObservations, buildObservations, defaultImportance, buildSelfMemory } from "../observe";
import type { WorldState } from "../../types";

describe("buildSelfMemory (evidence → memory)", () => {
  it("builds an observation memory for one character with keywords and importance", () => {
    const m = buildSelfMemory("w-test", "c-lan", "（我记下）那人拿走了我的剑", 6);
    expect(m.instanceId).toBe("w-test");
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
    objects: { "o-key": { id: "o-key", name: "铜钥匙", detail: "fleshed", locationId: "bar", state: "在吧台上", props: {} } },
    roster: { "c-lan": { name: "阿岚" }, "c-zhou": { name: "老周" }, "c-mei": { name: "阿梅" } },
    flags: {},
  };
}

describe("buildObservations (witness-scoped)", () => {
  it("writes one observation per present character, and NOT to absent characters", () => {
    const obs = buildObservations("w-test", state(), { speakerName: "你", text: "我把枪放在吧台上" });
    const charIds = obs.map((m) => m.charId).sort();
    expect(obs.every((m) => m.instanceId === "w-test")).toBe(true);
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

describe("buildConsequenceObservations (committed consequence → witness memory)", () => {
  it("does not broadcast exact concealment facts to every co-present character", () => {
    const obs = buildConsequenceObservations(
      "w-test",
      state(),
      [{ kind: "setFact", id: "f-key-hidden", entityId: "o-key", field: "hidden", value: "地板下", hardness: "anchored" }],
      "我趁老周低头，把铜钥匙藏到地板下。",
      "br-test",
    );

    const zhou = obs.find((m) => m.charId === "c-zhou");
    expect(zhou).toBeDefined();
    expect(zhou?.text).toContain("铜钥匙");
    expect(zhou?.text).not.toContain("地板下");
    expect(zhou?.keywords).not.toEqual(expect.arrayContaining(["地", "板", "下"]));
    expect(zhou?.provenance).not.toBe("witnessed");
    expect(zhou?.confidence).toBeLessThan(1);
    expect(zhou?.perceptionQuality).toBe("partial");
  });

  it("writes committed consequences only to witnesses in the current scene", () => {
    const obs = buildConsequenceObservations(
      "w-test",
      state(),
      [{ kind: "setObjectState", objectId: "o-key", state: "被摔弯" }],
      "你把钥匙摔弯",
      "br-test",
    );

    const charIds = obs.map((m) => m.charId).sort();
    expect(charIds).toEqual(["c-lan", "c-zhou"]);
    expect(charIds).not.toContain("c-mei");
    expect(obs.every((m) => m.text.includes("铜钥匙变成被摔弯"))).toBe(true);
    expect(obs.every((m) => m.provenance === "witnessed")).toBe(true);
    expect(obs.every((m) => m.perceptionQuality === "full")).toBe(true);
    expect(obs.every((m) => m.instanceId === "w-test")).toBe(true);
    expect(obs.every((m) => m.branchId === "br-test")).toBe(true);
    expect(obs.every((m) => m.importance >= 7)).toBe(true);
  });

  it("returns no memories when no player-visible consequence was committed", () => {
    const obs = buildConsequenceObservations("w-test", state(), [{ kind: "advanceTime", clock: "凌晨 00:10" }], "等了一会儿");
    expect(obs).toEqual([]);
  });
});
