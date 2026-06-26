import { describe, it, expect } from "vitest";
import { classifyPrecision, mayEvolve, boundOffstageDeltas, offstageDeltaTarget } from "../offstage";
import type { WorldState } from "../../types";

function baseState(): WorldState {
  return {
    currentLocationId: "bar",
    time: { day: 1, clock: "夜", lighting: "暗" },
    locations: {
      bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: ["street"], presentCharacterIds: ["c-here"], objectIds: ["o-here"] },
      street: { id: "street", name: "街", detail: "fleshed", gist: "", connections: ["bar", "alley"], presentCharacterIds: ["c-adj"], objectIds: [] },
      alley: { id: "alley", name: "巷", detail: "fleshed", gist: "", connections: ["street"], presentCharacterIds: ["c-far"], objectIds: [] },
    },
    objects: { "o-here": { id: "o-here", name: "杯", detail: "fleshed", props: {}, locationId: "bar" } },
    roster: { "c-here": { name: "近" }, "c-adj": { name: "邻" }, "c-far": { name: "远" }, you: { name: "你" } },
    flags: {},
    pressureLines: [
      { id: "t1", summary: "远处的债", status: "active", intensity: 5, relatedCharacterIds: ["c-far"] },
    ],
  };
}

describe("§5.5 classifyPrecision", () => {
  it("near: current scene or adjacent location", () => {
    const s = baseState();
    expect(classifyPrecision(s, "c-here")).toBe("near");  // in current scene
    expect(classifyPrecision(s, "c-adj")).toBe("near");   // adjacent (street connects to bar)
    expect(classifyPrecision(s, "you")).toBe("near");     // the player is always focal
  });

  it("related: not near, but bound to an active thread", () => {
    const s = baseState();
    // c-far is in alley (not adjacent to bar) but the active thread t1 lists it
    expect(classifyPrecision(s, "c-far")).toBe("related");
  });

  it("far: neither near nor thread-bound → frozen", () => {
    const s = baseState();
    s.pressureLines = []; // drop the thread so c-far is no longer related
    expect(classifyPrecision(s, "c-far")).toBe("far");
    expect(mayEvolve(s, "c-far")).toBe(false);
  });
});

describe("§5.5 offstageDeltaTarget", () => {
  it("maps entity-bearing deltas to their target, and world-global deltas to null", () => {
    expect(offstageDeltaTarget({ kind: "moveCharacter", characterId: "c-far", toLocationId: "bar" })).toBe("c-far");
    expect(offstageDeltaTarget({ kind: "setCondition", entityId: "c-here", condition: "累" })).toBe("c-here");
    expect(offstageDeltaTarget({ kind: "advanceTime", clock: "晨" })).toBeNull();
    expect(offstageDeltaTarget({ kind: "advanceThread", id: "t1", intensityDelta: 1 })).toBeNull();
  });
});

describe("§5.5 boundOffstageDeltas", () => {
  it("drops deltas targeting a far/frozen entity, keeps near/related and world-global", () => {
    const s = baseState();
    s.pressureLines = []; // c-far now truly far
    const out = boundOffstageDeltas(s, [
      { kind: "setCondition", entityId: "c-here", condition: "打盹" },        // near → keep
      { kind: "setCondition", entityId: "c-far", condition: "走远了" },        // far → drop
      { kind: "advanceTime", clock: "晨" },                                    // global → keep
    ]);
    const targets = out.map((d) => (d.kind === "setCondition" ? d.entityId : d.kind));
    expect(targets).toContain("c-here");
    expect(targets).toContain("advanceTime");
    expect(targets).not.toContain("c-far");
  });

  it("keeps a related (thread-bound) entity's change", () => {
    const s = baseState(); // t1 binds c-far → related
    const out = boundOffstageDeltas(s, [{ kind: "setCondition", entityId: "c-far", condition: "被催债" }]);
    expect(out).toHaveLength(1);
  });

  it("caps entity-bearing offstage changes by near/related precision budgets", () => {
    const s = baseState();
    s.roster["c-adj2"] = { name: "邻二" };
    s.roster["c-rel"] = { name: "牵连者" };
    s.locations.street.presentCharacterIds.push("c-adj2");
    s.locations.alley.presentCharacterIds.push("c-rel");
    s.pressureLines![0].relatedCharacterIds = ["c-far", "c-rel"];

    const out = boundOffstageDeltas(s, [
      { kind: "setCondition", entityId: "c-here", condition: "打盹" },
      { kind: "setCondition", entityId: "c-adj", condition: "收伞" },
      { kind: "setCondition", entityId: "c-adj2", condition: "低声争执" },
      { kind: "setObjectState", objectId: "o-here", state: "杯底多了一圈水" },
      { kind: "setCondition", entityId: "c-far", condition: "被催债" },
      { kind: "setCondition", entityId: "c-rel", condition: "躲在巷口" },
      { kind: "advanceTime", clock: "晨" },
    ]);

    expect(out).toEqual([
      { kind: "setCondition", entityId: "c-here", condition: "打盹" },
      { kind: "setCondition", entityId: "c-adj", condition: "收伞" },
      { kind: "setCondition", entityId: "c-adj2", condition: "低声争执" },
      { kind: "setCondition", entityId: "c-far", condition: "被催债" },
      { kind: "advanceTime", clock: "晨" },
    ]);
  });

  it("drops offstage advancement of an unknown pressure line unless it carries a player-facing sign", () => {
    const s = baseState();
    const out = boundOffstageDeltas(s, [
      { kind: "advanceThread", id: "t1", intensityDelta: 1 },
      { kind: "advanceThread", id: "t1", playerKnown: true },
      { kind: "advanceThread", id: "t1", intensityDelta: 1, nextSign: "巷口多了一张催债纸" },
      { kind: "advanceThread", id: "t1", playerKnown: true, nextSign: "巷口多了一张催债纸" },
    ]);

    expect(out).toEqual([
      { kind: "advanceThread", id: "t1", intensityDelta: 1, nextSign: "巷口多了一张催债纸" },
      { kind: "advanceThread", id: "t1", playerKnown: true, nextSign: "巷口多了一张催债纸" },
    ]);
  });

  it("keeps offstage advancement for an already-known pressure line without requiring a fresh sign", () => {
    const s = baseState();
    s.pressureLines![0].playerKnown = true;

    expect(boundOffstageDeltas(s, [{ kind: "advanceThread", id: "t1", intensityDelta: 1 }])).toEqual([
      { kind: "advanceThread", id: "t1", intensityDelta: 1 },
    ]);
  });
});
