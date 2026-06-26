import { describe, it, expect } from "vitest";
import { resolvePerception, assertNoOutOfWorldLeak, type CharacterProjection } from "../perception";
import { DEMO_SEED } from "../../world/seed-demo";
import type { Memory, WorldState } from "../../types";

const mem = (charId: string, text: string, over: Partial<Memory> = {}): Memory => ({
  id: `m-${Math.round(text.length)}-${charId}`,
  instanceId: "w-test",
  charId,
  kind: "observation",
  text,
  keywords: [],
  importance: 5,
  createdAt: 1,
  lastAccessed: 1,
  ...over,
});

describe("resolvePerception (§4.2 single perception boundary)", () => {
  it("is witness-scoped: projects only the character's own memories", () => {
    const c = DEMO_SEED.characters[0]; // c-lan
    const own = [mem(c.id, "你：我之前来过"), mem(c.id, "老周：你又来啦")];
    const p = resolvePerception({ seed: DEMO_SEED, state: DEMO_SEED.openingState, ownMemories: own, query: "来过" }, c);
    expect(p.memories.every((m) => m.charId === c.id)).toBe(true);
    expect(p.recent.every((m) => m.charId === c.id)).toBe(true);
  });

  it("scores own memories (top-K) and takes the last 8 as recent — retrieval lives on the boundary", () => {
    const c = DEMO_SEED.characters[0];
    const own = Array.from({ length: 12 }, (_, i) => mem(c.id, `观察${i}`, { id: `m${i}`, createdAt: i }));
    const p = resolvePerception({ seed: DEMO_SEED, state: DEMO_SEED.openingState, ownMemories: own, query: "观察" }, c);
    expect(p.memories.length).toBeLessThanOrEqual(6);
    expect(p.recent).toHaveLength(8);
    expect(p.recent).toEqual(own.slice(-8));
  });

  it("stance only includes present targets, never an absent character's relationship", () => {
    const c = DEMO_SEED.characters[0]; // c-lan
    const state: WorldState = {
      ...DEMO_SEED.openingState,
      locations: {
        ...DEMO_SEED.openingState.locations,
        bar: { ...DEMO_SEED.openingState.locations["bar"], presentCharacterIds: ["c-lan"] }, // c-zhou absent
      },
      relationships: { "c-lan": { "c-zhou": { affinity: -50, disposition: "敌视", evidence: [], sinceDay: 0 } } },
    };
    const p = resolvePerception({ seed: DEMO_SEED, state, query: "" }, c);
    expect(p.stance.find((s) => s.phrase === "敌视")).toBeUndefined();
  });

  it("surfaces a present target's disposition in stance", () => {
    const c = DEMO_SEED.characters[0];
    const state: WorldState = {
      ...DEMO_SEED.openingState,
      relationships: { "c-lan": { "you": { affinity: -40, disposition: "记恨在心", evidence: [], sinceDay: 0 } } },
    };
    const p = resolvePerception({ seed: DEMO_SEED, state, query: "" }, c);
    expect(p.stance).toContainEqual({ name: "你（玩家）", phrase: "记恨在心" });
  });

  it("surfaces the latest relationship evidence as an in-character stance reason", () => {
    const c = DEMO_SEED.characters[0];
    const state: WorldState = {
      ...DEMO_SEED.openingState,
      relationships: {
        "c-lan": {
          "you": {
            affinity: -40,
            disposition: "对你更戒备",
            evidence: ["你掰弯了银戒指"],
            sinceDay: 1,
          },
        },
      },
    };

    const p = resolvePerception({ seed: DEMO_SEED, state, query: "" }, c);

    expect(p.stance).toContainEqual({ name: "你（玩家）", phrase: "对你更戒备（近因：你掰弯了银戒指）" });
  });

  it("triggers lore whose key is on-stage, and not lore whose key is absent", () => {
    const c = DEMO_SEED.characters[0];
    const state: WorldState = {
      ...DEMO_SEED.openingState,
      lore: [
        { id: "l1", keys: ["無燈"], content: "不问来路。" },
        { id: "l2", keys: ["飞龙在天"], content: "失传剑诀。" },
      ],
    };
    const p = resolvePerception({ seed: DEMO_SEED, state, query: "" }, c);
    const ids = p.triggeredLore.map((e) => e.id);
    expect(ids).toContain("l1");
    expect(ids).not.toContain("l2");
  });

  it("a normal projection passes the out-of-world guard", () => {
    const c = DEMO_SEED.characters[0];
    expect(() => resolvePerception({ seed: DEMO_SEED, state: DEMO_SEED.openingState, query: "" }, c)).not.toThrow();
  });
});

describe("assertNoOutOfWorldLeak (charter §9 standing assertion)", () => {
  const clean = (): CharacterProjection => ({
    self: DEMO_SEED.characters[0],
    description: "x",
    visibleScene: "scene",
    memories: [],
    recent: [],
    stance: [],
    triggeredLore: [],
  });

  it("passes a clean projection", () => {
    expect(() => assertNoOutOfWorldLeak(clean())).not.toThrow();
  });

  for (const key of ["directorNote", "sceneContract", "taste", "godEdit", "crossWorldTaste"]) {
    it(`fires when an out-of-world field is injected: ${key}`, () => {
      const leaked = clean() as unknown as Record<string, unknown>;
      leaked[key] = "should never reach a character";
      expect(() => assertNoOutOfWorldLeak(leaked as unknown as CharacterProjection)).toThrow(/越界|out-of-world/);
    });
  }

  it("also fires in production because projection leaks are silent failures", () => {
    const before = Object.getOwnPropertyDescriptor(process.env, "NODE_ENV");
    Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true, enumerable: true, writable: true });
    try {
      const leaked = clean() as unknown as Record<string, unknown>;
      leaked.sceneContract = "should never reach a character";
      expect(() => assertNoOutOfWorldLeak(leaked as unknown as CharacterProjection)).toThrow(/越界|out-of-world/);
    } finally {
      if (before) Object.defineProperty(process.env, "NODE_ENV", before);
      else Reflect.deleteProperty(process.env, "NODE_ENV");
    }
  });
});
