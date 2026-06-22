import { describe, it, expect } from "vitest";
import { buildCharacterPrompt, presentCharacters } from "../prompt";
import { DEMO_SEED } from "../../world/seed-demo";

describe("prompt", () => {
  it("present characters are those in the current location", () => {
    const present = presentCharacters(DEMO_SEED, DEMO_SEED.openingState);
    expect(present.map((c) => c.id)).toEqual(["c-lan", "c-zhou"]);
  });
  it("system prompt grounds the character in worldview + current visible scene, not global truth", () => {
    const c = DEMO_SEED.characters[0];
    const msgs = buildCharacterPrompt(DEMO_SEED, DEMO_SEED.openingState, c);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("阿岚");
    expect(msgs[0].content).toContain("無燈酒馆"); // 当前可见场景
    expect(msgs[0].content).toContain(DEMO_SEED.rules.physics); // 不可变规则锚
  });
});
