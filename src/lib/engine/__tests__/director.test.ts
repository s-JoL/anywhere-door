import { describe, it, expect } from "vitest";
import { updateTension, directorNarrate, maybeDirect } from "../director";
import type { ChatMessage, WorldState } from "../../types";

describe("updateTension (pure)", () => {
  it("rises on charged/action lines, decays on calm, clamps 0..10", () => {
    expect(updateTension(2, "（拔枪）别动！")).toBeGreaterThan(2);
    expect(updateTension(5, "嗯，天气不错。")).toBeLessThan(5);
    expect(updateTension(10, "（开枪）！！")).toBeLessThanOrEqual(10);
    expect(updateTension(0, "……")).toBeGreaterThanOrEqual(0);
  });
});

describe("directorNarrate", () => {
  const state: WorldState = {
    currentLocationId: "bar", time: { day: 1, clock: "深夜", lighting: "冷光" },
    locations: { bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: [], presentCharacterIds: [], objectIds: [] } },
    objects: {}, roster: {}, flags: {},
  };
  it("returns a trimmed narration string from the llm", async () => {
    const llm = async (_m: ChatMessage[]) => ({ content: "  雨势更急了，霓虹在水洼里碎成一片血红。  " });
    expect(await directorNarrate({ state, recentLines: ["你：我推门进来"], llm })).toBe("雨势更急了，霓虹在水洼里碎成一片血红。");
  });
  it("returns null on empty content or llm error", async () => {
    expect(await directorNarrate({ state, recentLines: [], llm: async () => ({ content: "   " }) })).toBeNull();
    expect(await directorNarrate({ state, recentLines: [], llm: async () => { throw new Error("x"); } })).toBeNull();
  });

  it("passes Director Notes only to the Director prompt as out-of-world steering", async () => {
    let prompt = "";
    const llm = async (messages: ChatMessage[]) => {
      prompt = messages.map((m) => m.content).join("\n");
      return { content: "雨声压低，酒馆像把呼吸放慢了半拍。" };
    };

    await directorNarrate({
      state,
      recentLines: ["你：（拔枪）别动！"],
      directorNotes: [{ id: "dn1", text: "让这一幕慢一点，别让阿岚立刻摊牌。", createdAt: 1 }],
      llm,
    });

    expect(prompt).toContain("【导演笔记】");
    expect(prompt).toContain("慢一点");
  });

  it("passes the active Scene Contract only to the Director prompt", async () => {
    let prompt = "";
    const llm = async (messages: ChatMessage[]) => {
      prompt = messages.map((m) => m.content).join("\n");
      return { content: "檐下的火光稳住，远处追兵的马蹄声暂时沉下去。" };
    };

    await directorNarrate({
      state,
      recentLines: ["你：（藏好伤口）先别声张。"],
      sceneContract: { id: "sc1", text: "本场慢烧，暂停外部追兵，强度保持中等。", createdAt: 1 },
      llm,
    });

    expect(prompt).toContain("【场景合约】");
    expect(prompt).toContain("暂停外部追兵");
  });

  it("grounds Director prose in the narration rule and committed truth snapshot", async () => {
    let prompt = "";
    const llm = async (messages: ChatMessage[]) => {
      prompt = messages.map((m) => m.content).join("\n");
      return { content: "杯底的水痕在冷光里收紧，像有人刚把一个念头咽回去。" };
    };
    const groundedState: WorldState = {
      ...state,
      locations: {
        bar: {
          id: "bar",
          name: "酒馆",
          detail: "fleshed",
          gist: "雨夜吧台",
          connections: [],
          presentCharacterIds: ["c-lan"],
          objectIds: ["o-glass"],
        },
      },
      objects: {
        "o-glass": { id: "o-glass", name: "威士忌杯", detail: "fleshed", props: {}, locationId: "bar", state: "空着，杯底有一圈水痕" },
      },
      roster: { "c-lan": { name: "阿岚" }, "c-zhou": { name: "老周" } },
      facts: [{ id: "f1", entityId: "o-glass", field: "state", value: "杯底有水痕", hardness: "anchored", playerKnown: true }],
      pressureLines: [{ id: "p1", summary: "老周的债主即将上门", status: "active", intensity: 7, playerKnown: true, nextSign: "柜台后的电话响起" }],
    };

    await directorNarrate({
      state: groundedState,
      recentLines: ["你：我把杯子转向灯下。"],
      rules: {
        physics: "现实世界物理，无超自然。",
        setting: "近未来雨城。",
        redLines: [],
        narrationRule: "短句、冷光、只写可见物；允许暗示，但不得发明不在快照中的实体。",
      },
      llm,
    });

    expect(prompt).toContain("【叙述规则】");
    expect(prompt).toContain("短句、冷光");
    expect(prompt).toContain("【已提交事实快照】");
    expect(prompt).toContain("酒馆");
    expect(prompt).toContain("阿岚");
    expect(prompt).toContain("威士忌杯");
    expect(prompt).toContain("杯底有水痕");
    expect(prompt).toContain("老周的债主即将上门");
  });
});

describe("maybeDirect", () => {
  const state: WorldState = {
    currentLocationId: "bar", time: { day: 1, clock: "深夜", lighting: "冷光" },
    locations: { bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: [], presentCharacterIds: [], objectIds: [] } },
    objects: {}, roster: {}, flags: {},
  };
  const llm = async (_m: ChatMessage[]) => ({ content: "雨声忽然变急。" });
  const base = { instanceId: "i1", state, recentLines: ["你：……"], llm };

  it("narrates on a clear tension jump (>=1.5) from low", async () => {
    const beat = await maybeDirect({ ...base, tensionBefore: 2, tensionAfter: 4 });
    expect(beat).not.toBeNull();
    expect(beat?.narration).toBe(true);
  });

  it("narrates while tension is high and still climbing, even without a 1.5 jump", async () => {
    const beat = await maybeDirect({ ...base, tensionBefore: 7, tensionAfter: 8 });
    expect(beat).not.toBeNull();
  });

  it("stays silent when tension is high but flat/decaying (anti-spam)", async () => {
    expect(await maybeDirect({ ...base, tensionBefore: 8, tensionAfter: 8 })).toBeNull();
    expect(await maybeDirect({ ...base, tensionBefore: 9, tensionAfter: 7 })).toBeNull();
  });

  it("stays silent on a calm, low, barely-moving turn", async () => {
    expect(await maybeDirect({ ...base, tensionBefore: 1, tensionAfter: 1.5 })).toBeNull();
  });
});
