import { describe, it, expect } from "vitest";
import { buildCharacterPrompt } from "../prompt";
import { DEMO_SEED } from "../../world/seed-demo";
import type { Memory } from "../../types";

const mem = (over: Partial<Memory>): Memory => ({
  id: "m", charId: "c-lan", kind: "observation", text: "你：我来过这里",
  keywords: [], importance: 5, createdAt: 1, lastAccessed: 1, ...over,
});

describe("§5.4 subjective records wired into narration", () => {
  it("hedges a low-confidence memory with an uncertain marker", () => {
    const c = DEMO_SEED.characters[0];
    const msgs = buildCharacterPrompt(DEMO_SEED, DEMO_SEED.openingState, c, {
      memories: [mem({ text: "据说后巷有杀手", confidence: 0.3, provenance: "heard" })],
    });
    expect(msgs[0].content).toContain("（不确定）据说后巷有杀手");
  });

  it("does not hedge a confident memory", () => {
    const c = DEMO_SEED.characters[0];
    const msgs = buildCharacterPrompt(DEMO_SEED, DEMO_SEED.openingState, c, {
      memories: [mem({ text: "我亲眼看见他进来", confidence: 1, provenance: "witnessed" })],
    });
    expect(msgs[0].content).toContain("· 我亲眼看见他进来");
    expect(msgs[0].content).not.toContain("（不确定）我亲眼看见他进来");
  });

  it("surfaces a subjective interpretation alongside the record", () => {
    const c = DEMO_SEED.characters[0];
    const msgs = buildCharacterPrompt(DEMO_SEED, DEMO_SEED.openingState, c, {
      memories: [mem({ text: "他付账时手在抖", interpretation: "他在怕什么" })],
    });
    expect(msgs[0].content).toContain("他付账时手在抖（我的理解：他在怕什么）");
  });
});
