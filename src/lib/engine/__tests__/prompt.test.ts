import { describe, it, expect } from "vitest";
import { buildCharacterPrompt, presentCharacters, stripSpeakerPrefix } from "../prompt";
import { DEMO_SEED } from "../../world/seed-demo";
import type { Character, WorldState } from "../../types";

describe("prompt", () => {
  it("present characters are those in the current location", () => {
    const present = presentCharacters(DEMO_SEED, DEMO_SEED.openingState);
    expect(present.map((c) => c.id)).toEqual(["c-lan", "c-zhou"]);
  });

  it("system prompt grounds the character in worldview + rules; last message is scene + reinforcement", () => {
    const c = DEMO_SEED.characters[0];
    const msgs = buildCharacterPrompt(DEMO_SEED, DEMO_SEED.openingState, c);

    // First message is system
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("阿岚");           // character name in system
    expect(msgs[0].content).toContain(DEMO_SEED.rules.physics); // immutable rules anchor
    expect(msgs[0].content).toContain(DEMO_SEED.worldview);     // worldview in system

    // Last message is user-role tail with scene + reinforcement
    const last = msgs[msgs.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toContain("無燈酒馆");           // scene location name
    // Reinforcement phrase present
    expect(
      last.content.includes("不设限") ||
      last.content.includes("绝不出戏") ||
      last.content.includes("入戏铁律")
    ).toBe(true);
  });

  it("injects retrieved memories into system and recent observations as user-turn messages", () => {
    const c = DEMO_SEED.characters[0];
    const msgs = buildCharacterPrompt(DEMO_SEED, DEMO_SEED.openingState, c, {
      memories: [{ id: "m1", charId: c.id, kind: "observation", text: "你：我之前来过这里", keywords: [], importance: 5, createdAt: 1, lastAccessed: 1 }],
      recent: [{ id: "r1", charId: c.id, kind: "observation", text: "老周：你又来啦", keywords: [], importance: 4, createdAt: 2, lastAccessed: 2 }],
    });

    // Memory injected into system message
    const sys = msgs[0].content;
    expect(sys).toContain("我之前来过这里");

    // Recent observation appears as a user-turn message (before the tail)
    expect(msgs.some((m) => m.content.includes("老周：你又来啦"))).toBe(true);
  });

  it("buildCharacterPrompt: injects disposition for present targets", () => {
    const c = DEMO_SEED.characters[0]; // c-lan
    const stateWithRel = {
      ...DEMO_SEED.openingState,
      relationships: { "c-lan": { "you": "记恨在心" } },
    };
    const msgs = buildCharacterPrompt(DEMO_SEED, stateWithRel, c, {});
    const sys = msgs[0].content;
    expect(sys).toContain("记恨在心");
    expect(sys).toContain("你（玩家）");
  });

  it("buildCharacterPrompt: does NOT inject disposition for absent targets", () => {
    const c = DEMO_SEED.characters[0]; // c-lan
    // c-zhou IS present in openingState (both c-lan and c-zhou are in bar)
    // We need c-zhou to NOT be present — create a modified state
    const stateWithoutZhou = {
      ...DEMO_SEED.openingState,
      locations: {
        ...DEMO_SEED.openingState.locations,
        bar: {
          ...DEMO_SEED.openingState.locations["bar"],
          presentCharacterIds: ["c-lan"], // c-zhou removed from bar
        },
      },
      relationships: { "c-lan": { "c-zhou": "敌视" } },
    };
    const msgs = buildCharacterPrompt(DEMO_SEED, stateWithoutZhou, c, {});
    const sys = msgs[0].content;
    expect(sys).not.toContain("敌视");
  });

  it("injects matched lore when its key appears in the current scene", () => {
    const c = DEMO_SEED.characters[0];
    // 無燈酒馆 is the opening location name — use it as a lore key so it matches the visible scene.
    const stateWithLore = {
      ...DEMO_SEED.openingState,
      lore: [{ id: "l1", keys: ["無燈"], content: "無燈酒馆有条规矩：不问来路。" }],
    };
    const msgs = buildCharacterPrompt(DEMO_SEED, stateWithLore, c, {});
    const all = msgs.map((m) => m.content).join("\n");
    expect(all).toContain("無燈酒馆有条规矩：不问来路。");
  });

  it("injects matched lore when its key appears in recent memory context", () => {
    const c = DEMO_SEED.characters[0];
    const stateWithLore = {
      ...DEMO_SEED.openingState,
      lore: [{ id: "l1", keys: ["血誓录"], content: "血誓录是一本禁书。" }],
    };
    const msgs = buildCharacterPrompt(DEMO_SEED, stateWithLore, c, {
      recent: [{ id: "r1", charId: c.id, kind: "observation", text: "你：我手里这本血誓录是什么？", keywords: [], importance: 5, createdAt: 1, lastAccessed: 1 }],
    });
    const all = msgs.map((m) => m.content).join("\n");
    expect(all).toContain("血誓录是一本禁书。");
  });

  it("does NOT inject lore whose key is not mentioned anywhere", () => {
    const c = DEMO_SEED.characters[0];
    const stateWithLore = {
      ...DEMO_SEED.openingState,
      lore: [{ id: "l1", keys: ["飞龙在天"], content: "飞龙在天是失传的剑诀。" }],
    };
    const msgs = buildCharacterPrompt(DEMO_SEED, stateWithLore, c, {});
    const all = msgs.map((m) => m.content).join("\n");
    expect(all).not.toContain("飞龙在天是失传的剑诀。");
  });

  it("stripSpeakerPrefix removes a leading self-name prefix only", () => {
    expect(stripSpeakerPrefix("阿岚", "阿岚：（擦杯子）又是你。")).toBe("（擦杯子）又是你。");
    expect(stripSpeakerPrefix("阿岚", "阿岚:hi")).toBe("hi");
    expect(stripSpeakerPrefix("阿岚", "（没有前缀）正常说话")).toBe("（没有前缀）正常说话");
    expect(stripSpeakerPrefix("阿岚", "老周：这跟阿岚无关")).toBe("老周：这跟阿岚无关"); // 不误删别人/正文
  });
});

describe("presentCharacters — instance-private characters", () => {
  it("resolves ids from state.characters as well as seed.characters", () => {
    const spawned: Character = { id: "c-stranger", name: "陌生人", description: "角落里的人", detail: "stub" };
    const state: WorldState = {
      ...DEMO_SEED.openingState,
      characters: { "c-stranger": spawned },
      locations: {
        ...DEMO_SEED.openingState.locations,
        bar: {
          ...DEMO_SEED.openingState.locations.bar,
          presentCharacterIds: [...DEMO_SEED.openingState.locations.bar.presentCharacterIds, "c-stranger"],
        },
      },
    };
    const present = presentCharacters(DEMO_SEED, state);
    expect(present.map((c) => c.id)).toContain("c-stranger"); // instance-private resolved
    expect(present.map((c) => c.id)).toContain("c-lan");        // seed character still resolved
  });
});
