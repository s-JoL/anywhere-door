import { describe, it, expect } from "vitest";
import { buildCharacterPrompt, presentCharacters, stripSpeakerPrefix } from "../prompt";
import { DEMO_SEED } from "../../world/seed-demo";

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

  it("stripSpeakerPrefix removes a leading self-name prefix only", () => {
    expect(stripSpeakerPrefix("阿岚", "阿岚：（擦杯子）又是你。")).toBe("（擦杯子）又是你。");
    expect(stripSpeakerPrefix("阿岚", "阿岚:hi")).toBe("hi");
    expect(stripSpeakerPrefix("阿岚", "（没有前缀）正常说话")).toBe("（没有前缀）正常说话");
    expect(stripSpeakerPrefix("阿岚", "老周：这跟阿岚无关")).toBe("老周：这跟阿岚无关"); // 不误删别人/正文
  });
});
