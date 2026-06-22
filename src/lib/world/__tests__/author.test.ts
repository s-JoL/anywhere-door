import { describe, it, expect } from "vitest";
import { buildSeedFromDraft } from "../author";
import { DEMO_SEED } from "../seed-demo";
import type { WorldDraft } from "../author";

const modelConfig = DEMO_SEED.modelConfig;

describe("buildSeedFromDraft", () => {
  const baseDraft: WorldDraft = {
    title: "迷雾山庄",
    worldview: "永远弥漫的雾气中，一座古老庄园藏着秘密。",
    characters: [
      { name: "管家陈伯", description: "忠诚的老管家，知道所有秘密。", gender: "男", body: "六十岁男性，驼背", goal: "守护庄园的秘密", present: true },
      { name: "陌生访客", description: "深夜到访，来历不明。", goal: "寻找某样东西", present: false },
    ],
  };

  it("builds a valid seed from a complete draft", () => {
    const seed = buildSeedFromDraft(baseDraft, modelConfig, 1000);
    expect(seed).not.toBeNull();
    expect(seed!.source).toBe("created");
    expect(seed!.title).toBe("迷雾山庄");
    expect(seed!.worldview).toBe("永远弥漫的雾气中，一座古老庄园藏着秘密。");
    expect(seed!.createdAt).toBe(1000);
  });

  it("puts both named characters in characters[] and roster", () => {
    const seed = buildSeedFromDraft(baseDraft, modelConfig, 1000)!;
    expect(seed.characters).toHaveLength(2);
    expect(seed.characters.map((c) => c.name)).toContain("管家陈伯");
    expect(seed.characters.map((c) => c.name)).toContain("陌生访客");
    expect(Object.keys(seed.openingState.roster)).toHaveLength(2);
  });

  it("only the present character is in presentCharacterIds", () => {
    const seed = buildSeedFromDraft(baseDraft, modelConfig, 1000)!;
    const loc = seed.openingState.locations["scene"];
    expect(loc.presentCharacterIds).toHaveLength(1);
    const presentId = loc.presentCharacterIds[0];
    const presentChar = seed.characters.find((c) => c.id === presentId);
    expect(presentChar?.name).toBe("管家陈伯");
  });

  it("builds identity only when gender or body is given", () => {
    const seed = buildSeedFromDraft(baseDraft, modelConfig, 1000)!;
    const chen = seed.characters.find((c) => c.name === "管家陈伯")!;
    expect(chen.identity).toBeDefined();
    expect(chen.identity?.gender).toBe("男");
    expect(chen.identity?.body).toBe("六十岁男性，驼背");
    const stranger = seed.characters.find((c) => c.name === "陌生访客")!;
    // no gender/body on this char draft
    expect(stranger.identity).toBeUndefined();
  });

  it("applies default redLines when omitted", () => {
    const seed = buildSeedFromDraft(baseDraft, modelConfig, 1000)!;
    expect(seed.rules.redLines).toHaveLength(1);
    expect(seed.rules.redLines[0]).toContain("未成年人");
  });

  it("uses custom redLines when provided", () => {
    const draft: WorldDraft = { ...baseDraft, redLines: ["禁止暴力", "禁止赌博"] };
    const seed = buildSeedFromDraft(draft, modelConfig, 1000)!;
    expect(seed.rules.redLines).toEqual(["禁止暴力", "禁止赌博"]);
  });

  it("treats present:undefined as present (true by default)", () => {
    const draft: WorldDraft = {
      ...baseDraft,
      characters: [{ name: "默认在场者", description: "没有指定 present 字段。" }],
    };
    const seed = buildSeedFromDraft(draft, modelConfig, 1000)!;
    const loc = seed.openingState.locations["scene"];
    expect(loc.presentCharacterIds).toHaveLength(1);
  });

  it("returns null when title is empty", () => {
    const draft: WorldDraft = { ...baseDraft, title: "   " };
    expect(buildSeedFromDraft(draft, modelConfig, 1000)).toBeNull();
  });

  it("returns null when no character has a name", () => {
    const draft: WorldDraft = { ...baseDraft, characters: [{ name: "", description: "无名" }] };
    expect(buildSeedFromDraft(draft, modelConfig, 1000)).toBeNull();
  });

  it("uses sceneName and sceneDescription when provided", () => {
    const draft: WorldDraft = {
      ...baseDraft,
      sceneName: "庄园大厅",
      sceneDescription: "高挑的穹顶，壁炉燃着暗火。",
    };
    const seed = buildSeedFromDraft(draft, modelConfig, 1000)!;
    const loc = seed.openingState.locations["scene"];
    expect(loc.name).toBe("庄园大厅");
    expect(loc.description).toBe("高挑的穹顶，壁炉燃着暗火。");
    expect(loc.gist).toBe("高挑的穹顶，壁炉燃着暗火。".slice(0, 40));
  });

  it("falls back to title as location name and worldview as description", () => {
    const seed = buildSeedFromDraft(baseDraft, modelConfig, 1000)!;
    const loc = seed.openingState.locations["scene"];
    expect(loc.name).toBe("迷雾山庄");
    expect(loc.description).toBe("永远弥漫的雾气中，一座古老庄园藏着秘密。");
  });

  it("uses custom clock and lighting when provided", () => {
    const draft: WorldDraft = { ...baseDraft, clock: "午后三点", lighting: "晴朗午光" };
    const seed = buildSeedFromDraft(draft, modelConfig, 1000)!;
    expect(seed.openingState.time.clock).toBe("午后三点");
    expect(seed.openingState.time.lighting).toBe("晴朗午光");
  });

  it("always sets seed.presentation with a non-empty hook", () => {
    const seed = buildSeedFromDraft(baseDraft, modelConfig, 1000)!;
    expect(seed.presentation).toBeDefined();
    expect(seed.presentation!.hook.length).toBeGreaterThan(0);
    expect(seed.presentation!.genre.length).toBeGreaterThan(0);
  });

  it("uses provided hook from draft when given", () => {
    const draft: WorldDraft = {
      ...baseDraft,
      hook: "你站在庄园铁门外，雾让五步外的一切都消失了——而那扇门正在慢慢开。",
      genre: "悬疑",
      mood: ["压抑", "诡异"],
      intensity: "charged",
    };
    const seed = buildSeedFromDraft(draft, modelConfig, 1000)!;
    expect(seed.presentation!.hook).toBe("你站在庄园铁门外，雾让五步外的一切都消失了——而那扇门正在慢慢开。");
    expect(seed.presentation!.genre).toBe("悬疑");
    expect(seed.presentation!.mood).toEqual(["压抑", "诡异"]);
  });
});
