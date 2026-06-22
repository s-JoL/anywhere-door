import { describe, it, expect } from "vitest";
import { offstageCharacterIds, introduceCharacter } from "../introduce";
import { DEMO_SEED } from "../../world/seed-demo";

describe("introduce", () => {
  it("lists seed characters not present in any location", () => {
    const off = offstageCharacterIds(DEMO_SEED, DEMO_SEED.openingState);
    expect(off).toContain("c-mei"); // 幕后角色
    expect(off).not.toContain("c-lan");
    expect(off).not.toContain("c-zhou");
  });
  it("introduces an offstage character into a location immutably", () => {
    const next = introduceCharacter(DEMO_SEED.openingState, "c-mei", "bar");
    expect(next.locations.bar.presentCharacterIds).toContain("c-mei");
    expect(DEMO_SEED.openingState.locations.bar.presentCharacterIds).not.toContain("c-mei"); // 原状态未变
  });
});
