import { describe, it, expect } from "vitest";
import { parseIntent, decideIntent, affinityEagernessBoost } from "../intent";
import { DEMO_SEED } from "../../world/seed-demo";
import { keywordsOf } from "../../memory/keywords";
import type { ChatMessage, Memory, WorldState } from "../../types";

function memory(charId: string, id: string, text: string, createdAt: number, importance = 5): Memory {
  return {
    id,
    instanceId: "w-test",
    charId,
    kind: "observation",
    text,
    keywords: keywordsOf(text),
    importance,
    createdAt,
    lastAccessed: createdAt,
    provenance: "witnessed",
    confidence: 1,
    perceptionQuality: "full",
  };
}

describe("parseIntent", () => {
  it("parses a valid intent JSON", () => {
    expect(parseIntent('好的 {"action":"speak","eagerness":0.8} 结束')).toEqual({
      action: "speak",
      eagerness: 0.8,
    });
  });

  it("parses an avoid intent for visible social withdrawal", () => {
    expect(parseIntent('{"action":"avoid","eagerness":0.7}')).toEqual({
      action: "avoid",
      eagerness: 0.7,
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

  it("retrieves an older relevant witness memory for the intent judge", async () => {
    const c = DEMO_SEED.characters[0];
    const memories = [
      memory("c-lan", "mem-key", "你造成的后果：铜钥匙藏在地板下。", 1, 9),
      ...Array.from({ length: 8 }, (_, i) => memory("c-lan", `mem-noise-${i}`, `雨声里第 ${i + 1} 次无关闲谈。`, i + 2, 2)),
    ];
    let captured = "";
    const llm = async (messages: ChatMessage[]) => {
      captured = messages.map((m) => m.content).join("\n");
      return { content: '{"action":"pass","eagerness":0.1}' };
    };

    await decideIntent({
      seed: DEMO_SEED,
      state: DEMO_SEED.openingState,
      character: c,
      recent: [],
      ownMemories: memories,
      query: "地板下的铜钥匙呢？",
      llm,
    });

    expect(captured).toContain("铜钥匙藏在地板下");
  });

  it("raises eagerness when the current input touches a witnessed memory", async () => {
    const c = DEMO_SEED.characters[0];
    const llm = async (_messages: ChatMessage[]) => ({ content: '{"action":"pass","eagerness":0.1}' });
    const plain = await decideIntent({
      seed: DEMO_SEED,
      state: DEMO_SEED.openingState,
      character: c,
      ownMemories: [memory("c-lan", "mem-noise", "雨声里一次无关闲谈。", 1, 2)],
      query: "地板下的铜钥匙呢？",
      llm,
    });
    const remembered = await decideIntent({
      seed: DEMO_SEED,
      state: DEMO_SEED.openingState,
      character: c,
      ownMemories: [memory("c-lan", "mem-key", "你造成的后果：铜钥匙藏在地板下。", 1, 9)],
      query: "地板下的铜钥匙呢？",
      llm,
    });

    expect(remembered.eagerness).toBeGreaterThan(plain.eagerness);
  });

  it("turns strong relationship pressure plus a relevant memory into a speak intent", async () => {
    const c = DEMO_SEED.characters[0];
    const charged: WorldState = {
      ...DEMO_SEED.openingState,
      relationships: {
        "c-lan": {
          you: {
            affinity: -100,
            disposition: "对你更戒备",
            evidence: ["你掰弯了银戒指"],
            sinceDay: 1,
          },
        },
      },
    };
    const llm = async (_messages: ChatMessage[]) => ({ content: '{"action":"pass","eagerness":0.1}' });

    const result = await decideIntent({
      seed: DEMO_SEED,
      state: charged,
      character: c,
      ownMemories: [memory("c-lan", "mem-ring", "你造成的后果：你掰弯了银戒指。", 1, 10)],
      query: "那枚银戒指怎么弯了？",
      llm,
    });

    expect(result.action).toBe("speak");
    expect(result.eagerness).toBeGreaterThan(0.65);
  });
});

describe("affinityEagernessBoost (social causality → speak intent)", () => {
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
