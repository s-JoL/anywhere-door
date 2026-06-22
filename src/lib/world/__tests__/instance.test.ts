import { describe, it, expect } from "vitest";
import { instantiate } from "../instance";
import { DEMO_SEED } from "../seed-demo";

describe("instantiate", () => {
  it("forks a private instance whose state is a deep copy of the seed opening", () => {
    const inst = instantiate(DEMO_SEED, 100, "w1");
    expect(inst.seedId).toBe(DEMO_SEED.id);
    expect(inst.state).toEqual(DEMO_SEED.openingState);
    expect(inst.state).not.toBe(DEMO_SEED.openingState); // 深拷贝，互不影响
    inst.state.flags.touched = true;
    expect(DEMO_SEED.openingState.flags.touched).toBeUndefined();
  });
  it("demo seed has at least one present character in the opening location", () => {
    const loc = DEMO_SEED.openingState.locations[DEMO_SEED.openingState.currentLocationId];
    expect(loc.presentCharacterIds.length).toBeGreaterThan(0);
  });
  it("demo seed has two characters present in the opening location, each with a private goal", () => {
    const loc = DEMO_SEED.openingState.locations[DEMO_SEED.openingState.currentLocationId];
    expect(loc.presentCharacterIds).toContain("c-lan");
    expect(loc.presentCharacterIds).toContain("c-zhou");
    const zhou = DEMO_SEED.characters.find((c) => c.id === "c-zhou");
    expect(zhou?.goal && zhou.goal.length > 0).toBe(true);
  });
});
