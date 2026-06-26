import { describe, it, expect } from "vitest";
import { castTurn, decideSurfacing } from "../director";
import { DEMO_SEED } from "../../world/seed-demo";
import { keywordsOf } from "../../memory/keywords";
import type { Memory, WorldState } from "../../types";

function memory(charId: string, text: string, importance = 6): Memory {
  return {
    id: `m-${charId}-${text.length}`,
    instanceId: "w-test",
    charId,
    kind: "observation",
    text,
    keywords: keywordsOf(text),
    importance,
    createdAt: 1,
    lastAccessed: 1,
    provenance: "witnessed",
    confidence: 1,
    perceptionQuality: "full",
  };
}

describe("castTurn (§4.3 active/ambient split)", () => {
  it("keeps everyone active when present count is within the cap", () => {
    const c = castTurn({ seed: DEMO_SEED, state: DEMO_SEED.openingState });
    expect(c.active).toEqual(["c-lan", "c-zhou"]);
    expect(c.ambient).toEqual([]);
  });

  it("caps the active set and pushes the overflow to ambient", () => {
    const c = castTurn({ seed: DEMO_SEED, state: DEMO_SEED.openingState, maxActive: 1 });
    expect(c.active).toEqual(["c-lan"]);
    expect(c.ambient).toEqual(["c-zhou"]);
    // never more than the cap run as agents
    expect(c.active.length).toBeLessThanOrEqual(1);
  });

  it("prioritizes characters tied to active pressure lines when present count exceeds the cap", () => {
    const crowded: WorldState = {
      ...DEMO_SEED.openingState,
      locations: {
        ...DEMO_SEED.openingState.locations,
        bar: {
          ...DEMO_SEED.openingState.locations.bar,
          presentCharacterIds: ["c-lan", "c-zhou", "c-mei"],
        },
      },
      roster: {
        ...DEMO_SEED.openingState.roster,
        "c-mei": { name: "阿梅" },
      },
      characters: {
        "c-mei": {
          id: "c-mei",
          name: "阿梅",
          description: "欠债风波里的关键见证人。",
          goal: "确认玩家是否知道债主的暗号。",
        },
      },
      pressureLines: [
        {
          id: "debt",
          summary: "债主的暗号被人提起",
          status: "active",
          intensity: 9,
          relatedCharacterIds: ["c-mei"],
          playerKnown: true,
        },
      ],
    };

    const c = castTurn({ seed: DEMO_SEED, state: crowded, maxActive: 2 });

    expect(c.active).toContain("c-mei");
    expect(c.ambient).not.toContain("c-mei");
    expect(c.active).toHaveLength(2);
  });

  it("prioritizes characters with strong onstage relationship heat when present count exceeds the cap", () => {
    const crowded: WorldState = {
      ...DEMO_SEED.openingState,
      time: { ...DEMO_SEED.openingState.time, day: 1 },
      locations: {
        ...DEMO_SEED.openingState.locations,
        bar: {
          ...DEMO_SEED.openingState.locations.bar,
          presentCharacterIds: ["c-lan", "c-zhou", "c-mei"],
        },
      },
      roster: {
        ...DEMO_SEED.openingState.roster,
        "c-mei": { name: "阿梅" },
      },
      characters: {
        "c-mei": {
          id: "c-mei",
          name: "阿梅",
          description: "刚刚被玩家救过的人。",
          goal: "确认玩家是否值得信任。",
        },
      },
      relationships: {
        "c-mei": {
          you: { affinity: 95, evidence: ["玩家救过我"], sinceDay: 1 },
        },
      },
    };

    const c = castTurn({ seed: DEMO_SEED, state: crowded, maxActive: 2 });

    expect(c.active).toContain("c-mei");
    expect(c.ambient).not.toContain("c-mei");
  });

  it("lets Director Notes steer which named character gets active context", () => {
    const crowded: WorldState = {
      ...DEMO_SEED.openingState,
      locations: {
        ...DEMO_SEED.openingState.locations,
        bar: {
          ...DEMO_SEED.openingState.locations.bar,
          presentCharacterIds: ["c-lan", "c-zhou", "c-mei"],
        },
      },
      roster: {
        ...DEMO_SEED.openingState.roster,
        "c-mei": { name: "阿梅" },
      },
      characters: {
        "c-mei": {
          id: "c-mei",
          name: "阿梅",
          description: "一直站在门边沉默的人。",
          goal: "试探玩家是否值得信任。",
        },
      },
    };

    const c = castTurn({
      seed: DEMO_SEED,
      state: crowded,
      maxActive: 2,
      directorNotes: [{ id: "dn1", text: "让阿梅更主动一点，别让她继续沉默。", createdAt: 1 }],
    });

    expect(c.active).toContain("c-mei");
    expect(c.ambient).not.toContain("c-mei");
  });

  it("lets Scene Contract steer which named character gets active context", () => {
    const crowded: WorldState = {
      ...DEMO_SEED.openingState,
      locations: {
        ...DEMO_SEED.openingState.locations,
        bar: {
          ...DEMO_SEED.openingState.locations.bar,
          presentCharacterIds: ["c-lan", "c-zhou", "c-mei"],
        },
      },
      roster: {
        ...DEMO_SEED.openingState.roster,
        "c-mei": { name: "阿梅" },
      },
      characters: {
        "c-mei": {
          id: "c-mei",
          name: "阿梅",
          description: "一直站在门边沉默的人。",
          goal: "试探玩家是否值得信任。",
        },
      },
    };

    const c = castTurn({
      seed: DEMO_SEED,
      state: crowded,
      maxActive: 2,
      sceneContract: { id: "sc1", text: "本场聚焦阿梅和玩家的信任试探。", createdAt: 1 },
    });

    expect(c.active).toContain("c-mei");
    expect(c.ambient).not.toContain("c-mei");
  });

  it("lets Scene Contract steer through a character's own memories even when it does not name them", () => {
    const crowded: WorldState = {
      ...DEMO_SEED.openingState,
      locations: {
        ...DEMO_SEED.openingState.locations,
        bar: {
          ...DEMO_SEED.openingState.locations.bar,
          presentCharacterIds: ["c-lan", "c-zhou", "c-a", "c-b", "c-mei"],
        },
      },
      roster: {
        ...DEMO_SEED.openingState.roster,
        "c-a": { name: "甲客" },
        "c-b": { name: "乙客" },
        "c-mei": { name: "阿梅" },
      },
      characters: {
        "c-a": { id: "c-a", name: "甲客", description: "酒馆里的甲客。" },
        "c-b": { id: "c-b", name: "乙客", description: "酒馆里的乙客。" },
        "c-mei": { id: "c-mei", name: "阿梅", description: "一直站在门边沉默的人。" },
      },
    };

    const c = castTurn({
      seed: DEMO_SEED,
      state: crowded,
      maxActive: 4,
      sceneContract: { id: "sc1", text: "本场让银色筹码的保管人进入镜头，但不要直接点破。", createdAt: 1 },
      memoriesByCharacter: {
        "c-mei": [memory("c-mei", "你曾把银色筹码交给阿梅保管。", 9)],
      },
    });

    expect(c.active).toContain("c-mei");
    expect(c.ambient).not.toContain("c-mei");
  });

  it("prioritizes characters whose own memories match the current player input", () => {
    const crowded: WorldState = {
      ...DEMO_SEED.openingState,
      locations: {
        ...DEMO_SEED.openingState.locations,
        bar: {
          ...DEMO_SEED.openingState.locations.bar,
          presentCharacterIds: ["c-lan", "c-zhou", "c-a", "c-b", "c-mei"],
        },
      },
      roster: {
        ...DEMO_SEED.openingState.roster,
        "c-a": { name: "甲客" },
        "c-b": { name: "乙客" },
        "c-mei": { name: "阿梅" },
      },
      characters: {
        "c-a": { id: "c-a", name: "甲客", description: "酒馆里的甲客。" },
        "c-b": { id: "c-b", name: "乙客", description: "酒馆里的乙客。" },
        "c-mei": { id: "c-mei", name: "阿梅", description: "一直站在门边沉默的人。" },
      },
    };

    const c = castTurn({
      seed: DEMO_SEED,
      state: crowded,
      maxActive: 4,
      query: "我把银色筹码放在吧台上。",
      memoriesByCharacter: {
        "c-mei": [memory("c-mei", "你曾把银色筹码交给阿梅保管。", 9)],
      },
    });

    expect(c.active).toContain("c-mei");
    expect(c.ambient).not.toContain("c-mei");
  });

  it("prioritizes a present character with a wrong belief about a hard fact", () => {
    const crowded: WorldState = {
      ...DEMO_SEED.openingState,
      locations: {
        ...DEMO_SEED.openingState.locations,
        bar: {
          ...DEMO_SEED.openingState.locations.bar,
          presentCharacterIds: ["c-lan", "c-zhou", "c-a", "c-b", "c-mei"],
        },
      },
      roster: {
        ...DEMO_SEED.openingState.roster,
        "c-a": { name: "甲客" },
        "c-b": { name: "乙客" },
        "c-mei": { name: "阿梅" },
      },
      characters: {
        "c-a": { id: "c-a", name: "甲客", description: "酒馆里的甲客。" },
        "c-b": { id: "c-b", name: "乙客", description: "酒馆里的乙客。" },
        "c-mei": { id: "c-mei", name: "阿梅", description: "一直站在门边沉默的人。" },
      },
      facts: [{ id: "f-mei-truth", entityId: "c-mei", field: "truth", value: "王女", hardness: "core" }],
    };

    const c = castTurn({
      seed: DEMO_SEED,
      state: crowded,
      maxActive: 4,
      memoriesByCharacter: {
        "c-mei": [{
          ...memory("c-mei", "c-mei 坚信自己只是逃犯，不是什么王女。", 8),
          perceptionQuality: "garbled",
          distortion: "把王女身份记成了逃犯",
        }],
      },
    });

    expect(c.active).toContain("c-mei");
    expect(c.ambient).not.toContain("c-mei");
  });
});

describe("decideSurfacing (§4.3 world-consistent surfacing)", () => {
  // A state where c-zhou is offstage (only c-lan present in bar).
  const withZhouOffstage = (): WorldState => ({
    ...DEMO_SEED.openingState,
    locations: {
      ...DEMO_SEED.openingState.locations,
      bar: { ...DEMO_SEED.openingState.locations["bar"], presentCharacterIds: ["c-lan"] },
    },
  });

  it("returns null below the tension threshold", () => {
    expect(decideSurfacing(DEMO_SEED, withZhouOffstage(), 5)).toBeNull();
  });

  it("surfaces an offstage character (never a present one) at/above the threshold, from the adjacent world", () => {
    const s = decideSurfacing(DEMO_SEED, withZhouOffstage(), 6);
    expect(s).not.toBeNull();
    expect(s!.who).toBe("c-zhou");          // the offstage one
    expect(s!.how).not.toBe(undefined);
    // world-consistent: the surfaced character is NOT already present
    expect(withZhouOffstage().locations["bar"].presentCharacterIds).not.toContain(s!.who);
  });

  it("returns null when there is no offstage character to surface", () => {
    // place every seed character on-stage → nobody left to bring in
    const allPresent: WorldState = {
      ...DEMO_SEED.openingState,
      locations: {
        ...DEMO_SEED.openingState.locations,
        bar: { ...DEMO_SEED.openingState.locations["bar"], presentCharacterIds: DEMO_SEED.characters.map((c) => c.id) },
      },
    };
    expect(decideSurfacing(DEMO_SEED, allPresent, 9)).toBeNull();
  });
});
