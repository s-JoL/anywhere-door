import { describe, it, expect } from "vitest";
import { parseIntent, decideIntent, affinityEagernessBoost } from "../intent";
import { DEMO_SEED } from "../../world/seed-demo";
import type { ChatMessage, WorldState } from "../../types";

describe("parseIntent", () => {
  it("parses a valid intent JSON", () => {
    expect(parseIntent('好的 {"action":"speak","eagerness":0.8} 结束')).toEqual({
      action: "speak",
      eagerness: 0.8,
    });
  });

  it("clamps eagerness and defaults to safe pass on garbage", () => {
    expect(parseIntent("胡言乱语没有json")).toEqual({ action: "pass", eagerness: 0 });
    expect(parseIntent('{"action":"speak","eagerness":5}').eagerness).toBe(1);
  });
});

describe("decideIntent", () => {
  it("returns the parsed intent from the llm; safe-pass on llm error", async () => {
    const c = DEMO_SEED.characters[0];
    const okLlm = async (_m: ChatMessage[]) => ({ content: '{"action":"speak","eagerness":0.6}' });
    const r = await decideIntent({
      seed: DEMO_SEED,
      state: DEMO_SEED.openingState,
      character: c,
      recent: [],
      llm: okLlm,
    });
    expect(r).toEqual({ action: "speak", eagerness: 0.6 });

    const badLlm = async () => {
      throw new Error("boom");
    };
    const r2 = await decideIntent({
      seed: DEMO_SEED,
      state: DEMO_SEED.openingState,
      character: c,
      recent: [],
      llm: badLlm,
    });
    expect(r2).toEqual({ action: "pass", eagerness: 0 });
  });
});

describe("affinityEagernessBoost (社会因果→发言意图)", () => {
  function stateWithRel(affinity: number, toId = "you"): WorldState {
    return {
      ...DEMO_SEED.openingState,
      relationships: { "c-lan": { [toId]: { affinity, evidence: [], sinceDay: 1 } } },
    };
  }
  it("is 0 when the character has no relationships", () => {
    expect(affinityEagernessBoost(DEMO_SEED.openingState, "c-lan")).toBe(0);
  });
  it("grows with the magnitude of feeling toward a PRESENT party (love or hate)", () => {
    const hi = affinityEagernessBoost(stateWithRel(-90), "c-lan");
    const lo = affinityEagernessBoost(stateWithRel(-10), "c-lan");
    expect(hi).toBeGreaterThan(lo);
    expect(hi).toBeGreaterThan(0);
  });
  it("ignores feeling toward an ABSENT party", () => {
    expect(affinityEagernessBoost(stateWithRel(-90, "ghost-absent"), "c-lan")).toBe(0);
  });
});

describe("decideIntent: affinity nudges eagerness", () => {
  it("makes an emotionally-invested character keener to grab the floor", async () => {
    const c = DEMO_SEED.characters[0]; // c-lan
    const llm = async (_m: ChatMessage[]) => ({ content: '{"action":"speak","eagerness":0.3}' });
    const plain = await decideIntent({ seed: DEMO_SEED, state: DEMO_SEED.openingState, character: c, recent: [], llm });
    const charged: WorldState = { ...DEMO_SEED.openingState, relationships: { "c-lan": { you: { affinity: -100, evidence: [], sinceDay: 1 } } } };
    const hot = await decideIntent({ seed: DEMO_SEED, state: charged, character: c, recent: [], llm });
    expect(hot.eagerness).toBeGreaterThan(plain.eagerness);
  });
});
