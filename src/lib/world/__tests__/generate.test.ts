import { describe, it, expect } from "vitest";
import {
  topTasteTags,
  buildGeneratorPrompt,
  parseGeneratedSeed,
  generateWorld,
  DIVERSE_PALETTE,
  pickDiverseTargets,
} from "../generate";
import { instantiate } from "../instance";
import type { ModelConfig } from "@/lib/types";

const MODEL: ModelConfig = {
  provider: "openrouter",
  apiKey: "",
  model: "deepseek/deepseek-v4-pro",
  reasoningEnabled: false,
};

const USER_KEY_MODEL: ModelConfig = {
  provider: "openrouter",
  apiKey: "sk-user-secret",
  model: "deepseek/deepseek-v4-pro",
  reasoningEnabled: true,
};

// A valid generated-world JSON fixture matching the WorldDraft contract.
const VALID_WORLD = {
  title: "霜河剑歌",
  worldview: "北境大雪，江湖恩怨未了，一柄断剑在城中流转。",
  rules: {
    physics: "现实武侠物理，轻功与内力存在，但无神鬼。",
    setting: "古代北境江湖。",
    redLines: ["仅限成年人之间的虚构创作；排除任何未成年人相关内容。"],
    narrationRule: "凛冽、克制，像雪夜里压低声音讲出的江湖传闻；只转述已提交事实。",
  },
  time: { clock: "黄昏", lighting: "雪后冷光" },
  locations: [
    {
      name: "断剑客栈",
      description: "雪夜里唯一亮灯的客栈，炭火噼啪，刀光暗藏。",
      opening: true,
    },
    { name: "霜河渡口", description: "结冰的渡口，船家不知所踪。" },
  ],
  characters: [
    {
      name: "苏霜",
      description: "客栈掌柜，冷面热心，左手藏着旧伤。",
      goal: "查清断剑的来历。",
      identity: { gender: "女" },
      present: true,
    },
    {
      name: "白无衣",
      description: "追剑而来的剑客，笑里藏刀。",
      goal: "（私下）夺回断剑，不惜灭口。",
      present: false,
    },
  ],
  presentation: {
    genre: "武侠",
    mood: ["凛冽", "悬疑"],
    intensity: "charged",
    hook: "你推门进店，雪粒落在肩头。掌柜抬眼看你，手已经按在了柜下那柄断剑上。",
    entryAction: "按住柜下那柄断剑",
    cast: [
      { name: "苏霜", line: "掌柜，冷面，左手藏旧伤" },
      { name: "白无衣", line: "笑里藏刀的剑客" },
    ],
    accent: "#9ec5ff",
  },
  lore: [
    { keys: ["断剑", "霜河剑"], content: "断剑本是霜河剑，三百年前一战折断，至今认主。" },
    { keys: ["霜河渡口"], content: "霜河渡口曾是江湖人北上的唯一关口。" },
  ],
};

function llmReturning(text: string) {
  return async () => ({ content: text });
}

describe("topTasteTags", () => {
  it("returns highest positive tags, drops non-positive, caps n", () => {
    const profile = {
      "genre:武侠": 5,
      "mood:悬疑": 3,
      "intensity:charged": 8,
      "genre:科幻": -2, // negative -> dropped
      "mood:温馨": 0, // zero -> dropped
      "genre:悬疑": 1,
    };
    const top = topTasteTags(profile, 3);
    expect(top).toEqual(["intensity:charged", "genre:武侠", "mood:悬疑"]);
    expect(top).not.toContain("genre:科幻");
    expect(top).not.toContain("mood:温馨");
  });

  it("caps at n and handles empty profile", () => {
    expect(topTasteTags({}, 6)).toEqual([]);
    const many = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 };
    expect(topTasteTags(many, 2)).toEqual(["g", "f"]);
  });
});

describe("buildGeneratorPrompt", () => {
  const profile = { "genre:武侠": 5, "mood:悬疑": 3, "intensity:charged": 8 };

  it("exploit mode mentions the top tag in human form and asks for JSON + 2nd-person hook", () => {
    const msgs = buildGeneratorPrompt(profile, "exploit", ["旧世界A"]);
    expect(msgs.length).toBe(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[1].role).toBe("user");
    const all = msgs.map((m) => m.content).join("\n");
    // human-form tag, not raw "genre:武侠"
    expect(all).toContain("武侠");
    expect(all).not.toContain("genre:武侠");
    expect(all).toContain("JSON");
    // second-person hook requirement
    expect(all).toContain("你");
    expect(all).toContain("entryAction");
    expect(all).toContain("narrationRule");
    expect(all).toMatch(/叙述规则|事实快照|已提交事实/);
    expect(all).toMatch(/第一步行动|开场发言|按钮/);
    // avoid titles
    expect(all).toContain("旧世界A");
  });

  it("explore mode contains explicit divergence instruction", () => {
    const msgs = buildGeneratorPrompt(profile, "explore", []);
    const all = msgs.map((m) => m.content).join("\n");
    // explicit instruction to diverge / pick something the user has NOT engaged
    expect(all).toMatch(/没有|未|不同|偏离|避免重复|刻意/);
    expect(all).toContain("JSON");
  });

  it("includes avoidTitles in both modes", () => {
    const msgs = buildGeneratorPrompt({}, "exploit", ["禁忌之城", "另一个"]);
    const all = msgs.map((m) => m.content).join("\n");
    expect(all).toContain("禁忌之城");
    expect(all).toContain("另一个");
  });

  it("always carries the anti-default-dark / no-shared-motif spread instruction", () => {
    const all = buildGeneratorPrompt({}, "exploit", [])
      .map((m) => m.content)
      .join("\n");
    // anti-default-dark
    expect(all).toMatch(/不要默认走暗黑|不要默认.*暗黑/);
    // no-shared-motif
    expect(all).toMatch(/母题|第七层/);
  });

  it("honors opts.target genre/tone and opts.avoidGenres", () => {
    const msgs = buildGeneratorPrompt({}, "exploit", [], {
      target: { genre: "治愈日常", mood: ["温暖", "治愈"], intensity: "calm" },
      avoidGenres: ["武侠江湖"],
    });
    const all = msgs.map((m) => m.content).join("\n");
    // the requested genre is named
    expect(all).toContain("治愈日常");
    // it is told to avoid the over-represented genre
    expect(all).toContain("武侠江湖");
    // still carries the spread instruction
    expect(all).toMatch(/不要默认走暗黑|不要默认.*暗黑/);
    expect(all).toMatch(/母题|第七层/);
  });
});

describe("parseGeneratedSeed narration rule", () => {
  it("preserves the generated narration rule on WorldRules", () => {
    const seed = parseGeneratedSeed(JSON.stringify(VALID_WORLD), MODEL, "nr")!;
    expect(seed.rules.narrationRule).toContain("凛冽");
    expect(seed.rules.narrationRule).toContain("已提交事实");
  });
});

describe("DIVERSE_PALETTE & pickDiverseTargets", () => {
  it("palette spans the spectrum with light/cozy AND explicit entries", () => {
    expect(DIVERSE_PALETTE.length).toBeGreaterThanOrEqual(10);
    const intensities = new Set(DIVERSE_PALETTE.map((p) => p.intensity));
    expect(intensities.has("calm")).toBe(true);
    expect(intensities.has("explicit")).toBe(true);
    // genres are unique within the palette
    const genres = DIVERSE_PALETTE.map((p) => p.genre);
    expect(new Set(genres).size).toBe(genres.length);
  });

  it("pickDiverseTargets(4, []) returns 4 distinct genres incl. ≥1 calm/light", () => {
    const picked = pickDiverseTargets(4, []);
    expect(picked.length).toBe(4);
    const genres = picked.map((p) => p.genre);
    expect(new Set(genres).size).toBe(4);
    expect(picked.some((p) => p.intensity === "calm")).toBe(true);
  });

  it("pickDiverseTargets skips genres already in existingGenres", () => {
    const picked = pickDiverseTargets(3, ["治愈日常", "恐怖惊悚"]);
    expect(picked.length).toBe(3);
    const genres = picked.map((p) => p.genre);
    expect(genres).not.toContain("治愈日常");
    expect(genres).not.toContain("恐怖惊悚");
    expect(new Set(genres).size).toBe(3);
  });

  it("is deterministic (no randomness)", () => {
    const a = pickDiverseTargets(5, ["科幻冒险"]).map((p) => p.genre);
    const b = pickDiverseTargets(5, ["科幻冒险"]).map((p) => p.genre);
    expect(a).toEqual(b);
  });

  it("allows wrap-around repeats only after all genres are exhausted", () => {
    const n = DIVERSE_PALETTE.length + 2;
    const picked = pickDiverseTargets(n, []);
    expect(picked.length).toBe(n);
    // first full cycle is all-distinct
    const firstCycle = picked.slice(0, DIVERSE_PALETTE.length).map((p) => p.genre);
    expect(new Set(firstCycle).size).toBe(DIVERSE_PALETTE.length);
  });
});

describe("parseGeneratedSeed", () => {
  it("parses a valid generated-JSON fixture into a playable WorldSeed", () => {
    const seed = parseGeneratedSeed(JSON.stringify(VALID_WORLD), MODEL, "abc");
    expect(seed).not.toBeNull();
    if (!seed) return;
    expect(seed.id).toBe("seed-gen-abc");
    expect(seed.source).toBe("generated");
    expect(seed.title).toBe("霜河剑歌");
    expect(seed.modelConfig).toEqual(MODEL);
    expect(seed.createdAt).toBeTypeOf("number");

    // presentation
    expect(seed.presentation?.hook).toBeTruthy();
    expect(seed.presentation?.hook.length).toBeGreaterThan(0);
    expect(seed.presentation?.entryAction).toBe("按住柜下那柄断剑");
    expect(seed.presentation?.genre).toBe("武侠");

    // characters
    expect(seed.characters.length).toBeGreaterThanOrEqual(2);

    // openingState validity: currentLocationId exists in locations
    const cur = seed.openingState.currentLocationId;
    expect(seed.openingState.locations[cur]).toBeDefined();

    // roster covers all characters
    for (const c of seed.characters) {
      expect(seed.openingState.roster[c.id]).toBeDefined();
    }
  });

  it("does not persist the user's generation key into generated seeds", () => {
    const seed = parseGeneratedSeed(JSON.stringify(VALID_WORLD), USER_KEY_MODEL, "secret")!;
    expect(seed.modelConfig).toEqual({
      provider: "openrouter",
      apiKey: "",
      model: "deepseek/deepseek-v4-pro",
      reasoningEnabled: true,
    });
  });

  it("maps generated lore into openingState.lore with assigned ids", () => {
    const seed = parseGeneratedSeed(JSON.stringify(VALID_WORLD), MODEL, "lore");
    expect(seed).not.toBeNull();
    if (!seed) return;
    const lore = seed.openingState.lore;
    expect(lore).toBeDefined();
    expect(lore!.length).toBe(2);
    expect(lore![0].id).toMatch(/^lore-/);
    expect(lore![0].keys).toContain("断剑");
    expect(lore![0].content.length).toBeGreaterThan(0);
    // unique ids
    expect(new Set(lore!.map((l) => l.id)).size).toBe(lore!.length);
  });

  it("skips malformed lore entries safely (no keys / no content)", () => {
    const withBadLore = {
      ...VALID_WORLD,
      lore: [
        { keys: ["好的"], content: "有效设定" },
        { keys: [], content: "缺键" },
        { keys: ["缺内容"], content: "" },
        { content: "缺键字段" },
        "not an object",
      ],
    };
    const seed = parseGeneratedSeed(JSON.stringify(withBadLore), MODEL, "bad");
    expect(seed).not.toBeNull();
    expect(seed!.openingState.lore).toEqual([
      { id: "lore-0", keys: ["好的"], content: "有效设定" },
    ]);
  });

  it("handles a world with no lore (lore stays undefined)", () => {
    const noLore = { ...VALID_WORLD };
    delete (noLore as { lore?: unknown }).lore;
    const seed = parseGeneratedSeed(JSON.stringify(noLore), MODEL, "nolore");
    expect(seed).not.toBeNull();
    expect(seed!.openingState.lore).toBeUndefined();
  });

  it("tolerates JSON wrapped in prose / code fences", () => {
    const wrapped = "好的，这是世界：\n```json\n" + JSON.stringify(VALID_WORLD) + "\n```\n完成。";
    const seed = parseGeneratedSeed(wrapped, MODEL, "fence");
    expect(seed).not.toBeNull();
    expect(seed?.title).toBe("霜河剑歌");
  });

  it("returns null on garbage", () => {
    expect(parseGeneratedSeed("not json at all", MODEL, "x")).toBeNull();
    expect(parseGeneratedSeed("", MODEL, "x")).toBeNull();
    expect(parseGeneratedSeed("{ broken", MODEL, "x")).toBeNull();
  });

  it("returns null on missing required fields", () => {
    const noTitle = { ...VALID_WORLD, title: "" };
    expect(parseGeneratedSeed(JSON.stringify(noTitle), MODEL, "x")).toBeNull();

    const oneChar = { ...VALID_WORLD, characters: [VALID_WORLD.characters[0]] };
    expect(parseGeneratedSeed(JSON.stringify(oneChar), MODEL, "x")).toBeNull();

    const noLoc = { ...VALID_WORLD, locations: [] };
    expect(parseGeneratedSeed(JSON.stringify(noLoc), MODEL, "x")).toBeNull();

    const noHook = {
      ...VALID_WORLD,
      presentation: { ...VALID_WORLD.presentation, hook: "" },
    };
    expect(parseGeneratedSeed(JSON.stringify(noHook), MODEL, "x")).toBeNull();

    const noEntryAction = {
      ...VALID_WORLD,
      presentation: { ...VALID_WORLD.presentation, entryAction: "" },
    };
    expect(parseGeneratedSeed(JSON.stringify(noEntryAction), MODEL, "x")).toBeNull();
  });

  it("produces a seed that instantiate() does not throw on", () => {
    const seed = parseGeneratedSeed(JSON.stringify(VALID_WORLD), MODEL, "inst");
    expect(seed).not.toBeNull();
    if (!seed) return;
    expect(() => instantiate(seed, 1, "t")).not.toThrow();
    const inst = instantiate(seed, 1, "t");
    expect(inst.state.currentLocationId).toBeTruthy();
    expect(inst.state.locations[inst.state.currentLocationId]).toBeDefined();
  });
});

describe("generateWorld", () => {
  it("returns a generated seed for valid llm output", async () => {
    const seed = await generateWorld({
      profile: { "genre:武侠": 5 },
      mode: "exploit",
      avoidTitles: [],
      modelConfig: MODEL,
      llm: llmReturning(JSON.stringify(VALID_WORLD)),
      idSuffix: "gw1",
    });
    expect(seed).not.toBeNull();
    expect(seed?.source).toBe("generated");
    expect(seed?.id).toBe("seed-gen-gw1");
  });

  it("returns null for garbage and never throws", async () => {
    const seed = await generateWorld({
      profile: {},
      mode: "explore",
      avoidTitles: [],
      modelConfig: MODEL,
      llm: llmReturning("garbage"),
      idSuffix: "gw2",
    });
    expect(seed).toBeNull();
  });

  it("returns null when llm throws (never throws)", async () => {
    const seed = await generateWorld({
      profile: {},
      mode: "explore",
      avoidTitles: [],
      modelConfig: MODEL,
      llm: async () => {
        throw new Error("network");
      },
      idSuffix: "gw3",
    });
    expect(seed).toBeNull();
  });
});
