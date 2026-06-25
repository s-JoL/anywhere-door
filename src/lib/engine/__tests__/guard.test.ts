import { describe, it, expect } from "vitest";
import { consistencyGuard, guardSnapshot } from "../guard";
import type { WorldState } from "../../types";

function state(): WorldState {
  return {
    currentLocationId: "bar",
    time: { day: 1, clock: "夜", lighting: "暗" },
    locations: {
      bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: [], presentCharacterIds: ["c-lan"], objectIds: ["o-glass"] },
    },
    objects: { "o-glass": { id: "o-glass", name: "酒杯", detail: "fleshed", props: {}, locationId: "bar" } },
    roster: { "c-lan": { name: "阿岚" }, "c-mei": { name: "阿梅" }, you: { name: "你" } },
    flags: {},
  };
}

describe("§5.8 guardSnapshot", () => {
  it("collects on-stage names and offstage names", () => {
    const snap = guardSnapshot(state());
    expect(snap.presentNames).toEqual(expect.arrayContaining(["阿岚", "酒馆", "酒杯"]));
    expect(snap.offstageNames).toEqual(["阿梅"]); // 阿梅 offstage; 你 excluded
  });
});

describe("§5.8 consistencyGuard", () => {
  it("passes ambient prose that names nobody offstage", () => {
    const r = consistencyGuard("雨势更急，霓虹在水洼里碎成血红。", guardSnapshot(state()));
    expect(r.ok).toBe(true);
    expect(r.slips).toEqual([]);
  });

  it("flags prose that names an offstage character as a slip", () => {
    const r = consistencyGuard("阿梅从角落里站起身。", guardSnapshot(state()));
    expect(r.ok).toBe(false);
    expect(r.slips).toContain("阿梅");
  });

  it("does not flag a present character's name", () => {
    const r = consistencyGuard("阿岚擦了擦杯子。", guardSnapshot(state()));
    expect(r.ok).toBe(true);
  });
});
