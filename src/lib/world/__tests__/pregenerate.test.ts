import { describe, it, expect, beforeEach } from "vitest";
import { getRepository, resetRepository } from "@/lib/storage";
import { ensureGeneratedPool } from "../pregenerate";
import type { ModelConfig } from "@/lib/types";

const MODEL: ModelConfig = {
  provider: "openrouter",
  apiKey: "",
  model: "deepseek/deepseek-v4-pro",
  reasoningEnabled: false,
};

function makeWorld(title: string) {
  return {
    title,
    worldview: "一座永远在下雨的城市。",
    rules: {
      physics: "现实物理。",
      setting: "近未来。",
      redLines: ["仅限成年人之间的虚构创作；排除任何未成年人相关内容。"],
    },
    time: { clock: "深夜", lighting: "霓虹冷光" },
    locations: [
      { name: "酒馆", description: "唯一亮灯的地方。", opening: true },
      { name: "雨街", description: "湿漉漉的长街。" },
    ],
    characters: [
      { name: "甲", description: "掌柜。", goal: "看清来客。", present: true },
      { name: "乙", description: "常客。", goal: "（私下）讨债。", present: false },
    ],
    presentation: {
      genre: "都市",
      mood: ["暧昧"],
      intensity: "charged",
      hook: "你推门进去，雨声涌进来，吧台后的人头也没抬。",
      cast: [{ name: "甲", line: "掌柜" }],
      accent: "#f0c36b",
    },
  };
}

describe("ensureGeneratedPool", () => {
  beforeEach(() => {
    resetRepository();
    indexedDB.deleteDatabase("the-reveries");
  });

  it("adds target generated seeds on an empty pool with a valid llm", async () => {
    const repo = getRepository();
    let n = 0;
    const llm = async () => ({ content: JSON.stringify(makeWorld("世界" + n++)) });
    const added = await ensureGeneratedPool({
      repo,
      llm,
      modelConfig: MODEL,
      profile: { "genre:都市": 3 },
      target: 3,
    });
    expect(added).toBe(3);
    const seeds = await repo.listSeeds();
    const generated = seeds.filter((s) => s.source === "generated");
    expect(generated.length).toBe(3);
    // unique ids
    expect(new Set(generated.map((s) => s.id)).size).toBe(3);
  });

  it("adds 0 and does not throw when llm returns garbage", async () => {
    const repo = getRepository();
    const llm = async () => ({ content: "garbage not json" });
    const added = await ensureGeneratedPool({
      repo,
      llm,
      modelConfig: MODEL,
      profile: {},
      target: 3,
    });
    expect(added).toBe(0);
    const seeds = await repo.listSeeds();
    expect(seeds.filter((s) => s.source === "generated").length).toBe(0);
  });

  it("does not exceed target when some already exist", async () => {
    const repo = getRepository();
    let n = 0;
    const llm = async () => ({ content: JSON.stringify(makeWorld("世界" + n++)) });
    // first fill to 2
    await ensureGeneratedPool({ repo, llm, modelConfig: MODEL, profile: {}, target: 2 });
    expect((await repo.listSeeds()).filter((s) => s.source === "generated").length).toBe(2);
    // now ask for 3 total -> should add only 1 more
    const added = await ensureGeneratedPool({ repo, llm, modelConfig: MODEL, profile: {}, target: 3 });
    expect(added).toBe(1);
    expect((await repo.listSeeds()).filter((s) => s.source === "generated").length).toBe(3);
  });

  it("returns 0 when already at target (no llm calls needed)", async () => {
    const repo = getRepository();
    let calls = 0;
    let n = 0;
    const fillLlm = async () => ({ content: JSON.stringify(makeWorld("世界" + n++)) });
    await ensureGeneratedPool({ repo, llm: fillLlm, modelConfig: MODEL, profile: {}, target: 2 });
    const countingLlm = async () => {
      calls++;
      return { content: JSON.stringify(makeWorld("额外" + n++)) };
    };
    const added = await ensureGeneratedPool({ repo, llm: countingLlm, modelConfig: MODEL, profile: {}, target: 2 });
    expect(added).toBe(0);
    expect(calls).toBe(0);
  });
});
