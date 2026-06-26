import { describe, it, expect } from "vitest";
import { shouldReflect, parseInsights, buildReflectionPrompt, reflect } from "../reflect";
import type { Memory } from "../../types";
import type { LlmFn } from "../../engine/turn";

// ─── helpers ────────────────────────────────────────────────────────────────

const INSTANCE_ID = "w-test";

function makeObs(overrides: Partial<Memory> = {}): Memory {
  return {
    id: `mem-${Math.random().toString(36).slice(2)}`,
    instanceId: INSTANCE_ID,
    charId: "c1",
    kind: "observation",
    text: "老周说了句话。",
    keywords: ["老", "周"],
    importance: 5,
    createdAt: Date.now(),
    lastAccessed: Date.now(),
    ...overrides,
  };
}

function makeRefl(createdAt: number, overrides: Partial<Memory> = {}): Memory {
  return {
    id: `mem-${Math.random().toString(36).slice(2)}`,
    instanceId: INSTANCE_ID,
    charId: "c1",
    kind: "reflection",
    text: "我觉得老周靠不住。",
    keywords: ["老", "周"],
    importance: 7,
    createdAt,
    lastAccessed: createdAt,
    ...overrides,
  };
}

// ─── shouldReflect ───────────────────────────────────────────────────────────

describe("shouldReflect", () => {
  it("returns false when there are fewer than 6 observation memories", () => {
    const memories = Array.from({ length: 5 }, (_, i) => makeObs({ createdAt: 100 + i }));
    expect(shouldReflect(memories)).toBe(false);
  });

  it("returns true when there are exactly 6 observation memories and no reflection", () => {
    const memories = Array.from({ length: 6 }, (_, i) => makeObs({ createdAt: 100 + i }));
    expect(shouldReflect(memories)).toBe(true);
  });

  it("returns true when there are more than 6 observations and no reflection", () => {
    const memories = Array.from({ length: 10 }, (_, i) => makeObs({ createdAt: 100 + i }));
    expect(shouldReflect(memories)).toBe(true);
  });

  it("returns false when there are 6+ observations but a recent reflection resets the count", () => {
    const reflectionTime = 500;
    const refl = makeRefl(reflectionTime);
    // Only 3 observations AFTER the reflection
    const obs = Array.from({ length: 3 }, (_, i) => makeObs({ createdAt: reflectionTime + 10 + i }));
    // Some older observations (before reflection)
    const oldObs = Array.from({ length: 5 }, (_, i) => makeObs({ createdAt: 100 + i }));
    expect(shouldReflect([refl, ...oldObs, ...obs])).toBe(false);
  });

  it("returns true when 6+ observations exist after the most recent reflection", () => {
    const reflectionTime = 200;
    const refl = makeRefl(reflectionTime);
    const obs = Array.from({ length: 6 }, (_, i) => makeObs({ createdAt: reflectionTime + 10 + i }));
    expect(shouldReflect([refl, ...obs])).toBe(true);
  });

  it("uses the most recent reflection as the cutoff when multiple reflections exist", () => {
    const refl1 = makeRefl(100);
    const refl2 = makeRefl(500); // most recent
    // 5 obs after refl2
    const obs = Array.from({ length: 5 }, (_, i) => makeObs({ createdAt: 510 + i }));
    expect(shouldReflect([refl1, refl2, ...obs])).toBe(false);
  });
});

// ─── parseInsights ────────────────────────────────────────────────────────────

describe("parseInsights", () => {
  it("parses a JSON array of strings anywhere in the text", () => {
    const text = 'Here are insights: ["我不信任这个新来的客人。","我得盯紧我的左轮。","局势很危险。"]';
    const result = parseInsights(text);
    expect(result).toEqual(["我不信任这个新来的客人。", "我得盯紧我的左轮。", "局势很危险。"]);
  });

  it("caps at 3 insights even if JSON has more", () => {
    const text = '["a","b","c","d","e"]';
    const result = parseInsights(text);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("falls back to dash-prefixed lines when JSON is absent", () => {
    const text = "- 我不信任这个人。\n- 我要小心行事。";
    const result = parseInsights(text);
    expect(result).toEqual(["我不信任这个人。", "我要小心行事。"]);
  });

  it("falls back to middle-dot prefixed lines", () => {
    const text = "· 我不信任这个人。\n· 我要留神。";
    const result = parseInsights(text);
    expect(result).toEqual(["我不信任这个人。", "我要留神。"]);
  });

  it("falls back to digit-prefixed lines", () => {
    const text = "1. 这里不安全。\n2. 我要找出口。";
    const result = parseInsights(text);
    expect(result).toEqual(["这里不安全。", "我要找出口。"]);
  });

  it("returns [] for garbage input", () => {
    expect(parseInsights("")).toEqual([]);
    expect(parseInsights("random text no structure")).toEqual([]);
    expect(parseInsights("[not valid json")).toEqual([]);
  });

  it("drops empty strings after trimming", () => {
    const text = '["有效洞察。","","  "]';
    const result = parseInsights(text);
    expect(result).toEqual(["有效洞察。"]);
  });
});

// ─── buildReflectionPrompt ───────────────────────────────────────────────────

describe("buildReflectionPrompt", () => {
  it("returns an array of ChatMessages with system and user roles", () => {
    const recent = [makeObs({ text: "老周说了句话。" }), makeObs({ text: "阿岚沉默不语。" })];
    const msgs = buildReflectionPrompt("阿岚", recent);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("user");
  });

  it("embeds the character name in the system message", () => {
    const recent = [makeObs({ text: "有人进来了。" })];
    const msgs = buildReflectionPrompt("老周", recent);
    expect(msgs[0].content).toContain("老周");
  });

  it("includes each memory text in the user message", () => {
    const recent = [
      makeObs({ text: "陌生人来了。" }),
      makeObs({ text: "老周摸了摸枪。" }),
    ];
    const msgs = buildReflectionPrompt("阿岚", recent);
    expect(msgs[1].content).toContain("陌生人来了。");
    expect(msgs[1].content).toContain("老周摸了摸枪。");
  });
});

// ─── reflect ─────────────────────────────────────────────────────────────────

describe("reflect", () => {
  const fakeLlm: LlmFn = async (_messages) => ({
    content: '["我不信任这个新来的客人。","我得盯紧我的左轮。"]',
  });

  it("returns reflection memories with correct shape", async () => {
    const memories = Array.from({ length: 8 }, (_, i) =>
      makeObs({ charId: "c1", createdAt: 100 + i })
    );
    const result = await reflect({
      instanceId: INSTANCE_ID,
      characterName: "阿岚",
      charId: "c1",
      memories,
      llm: fakeLlm,
      now: 9000,
    });

    expect(result).toHaveLength(2);
    for (const r of result) {
      expect(r.kind).toBe("reflection");
      expect(r.instanceId).toBe(INSTANCE_ID);
      expect(r.charId).toBe("c1");
      expect(r.importance).toBe(7);
      expect(r.evidence).toBeDefined();
      expect(r.evidence!.length).toBeGreaterThan(0);
    }
  });

  it("creates reflections with text from llm insights", async () => {
    const memories = Array.from({ length: 8 }, (_, i) =>
      makeObs({ charId: "c1", createdAt: 100 + i })
    );
    const result = await reflect({
      instanceId: INSTANCE_ID,
      characterName: "阿岚",
      charId: "c1",
      memories,
      llm: fakeLlm,
      now: 9000,
    });

    const texts = result.map((r) => r.text);
    expect(texts).toContain("我不信任这个新来的客人。");
    expect(texts).toContain("我得盯紧我的左轮。");
  });

  it("returns [] when llm returns unparseable text", async () => {
    const badLlm: LlmFn = async () => ({ content: "这是一段无法解析的文本。" });
    const memories = Array.from({ length: 8 }, (_, i) =>
      makeObs({ charId: "c1", createdAt: 100 + i })
    );
    const result = await reflect({
      instanceId: INSTANCE_ID,
      characterName: "阿岚",
      charId: "c1",
      memories,
      llm: badLlm,
      now: 9000,
    });
    expect(result).toEqual([]);
  });

  it("returns [] when llm throws", async () => {
    const errorLlm: LlmFn = async () => { throw new Error("LLM error"); };
    const memories = Array.from({ length: 8 }, (_, i) =>
      makeObs({ charId: "c1", createdAt: 100 + i })
    );
    const result = await reflect({
      instanceId: INSTANCE_ID,
      characterName: "阿岚",
      charId: "c1",
      memories,
      llm: errorLlm,
      now: 9000,
    });
    expect(result).toEqual([]);
  });

  it("evidence array contains ids from the recent memories used", async () => {
    const memories = Array.from({ length: 8 }, (_, i) =>
      makeObs({ id: `mem-${i}`, charId: "c1", createdAt: 100 + i })
    );
    const result = await reflect({
      instanceId: INSTANCE_ID,
      characterName: "阿岚",
      charId: "c1",
      memories,
      llm: fakeLlm,
      now: 9000,
    });

    expect(result.length).toBeGreaterThan(0);
    const evidenceIds = result[0].evidence!;
    // Evidence should come from the memories we passed
    const allIds = new Set(memories.map((m) => m.id));
    for (const eid of evidenceIds) {
      expect(allIds.has(eid)).toBe(true);
    }
  });

  it("assigns distinct increasing createdAt times", async () => {
    const memories = Array.from({ length: 8 }, (_, i) =>
      makeObs({ charId: "c1", createdAt: 100 + i })
    );
    const result = await reflect({
      instanceId: INSTANCE_ID,
      characterName: "阿岚",
      charId: "c1",
      memories,
      llm: fakeLlm,
      now: 9000,
    });

    if (result.length >= 2) {
      expect(result[1].createdAt).toBeGreaterThan(result[0].createdAt);
    }
  });
});
