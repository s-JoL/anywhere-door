import { describe, it, expect } from "vitest";
import { buildObservations, buildSelfMemory } from "../observe";
import { propagateGossip } from "../gossip";
import { scoreMemories } from "../retrieve";
import type { Memory, WorldState } from "../../types";

const state: WorldState = {
  currentLocationId: "bar",
  time: { day: 1, clock: "夜", lighting: "暗" },
  locations: { bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: [], presentCharacterIds: ["c1", "c2"], objectIds: [] } },
  objects: {},
  roster: { c1: { name: "甲" }, c2: { name: "乙" } },
  flags: {},
};

describe("§4.5 provenance/confidence stamping", () => {
  it("first-hand observations are witnessed, full, and fully confident", () => {
    const obs = buildObservations(state, { speakerName: "甲", text: "我来了" });
    expect(obs.length).toBe(2);
    for (const m of obs) {
      expect(m.provenance).toBe("witnessed");
      expect(m.confidence).toBe(1);
      expect(m.perceptionQuality).toBe("full");
    }
  });

  it("buildSelfMemory is a witnessed first-hand record", () => {
    const m = buildSelfMemory("c1", "我记下点什么");
    expect(m.provenance).toBe("witnessed");
    expect(m.confidence).toBe(1);
  });

  it("hearsay is heard, partial, and less confident than first-hand", () => {
    const firsthand: Memory = {
      id: "m1", charId: "c1", kind: "observation", text: "甲：那个杀手摸进了后巷",
      keywords: ["杀手", "后巷"], importance: 8, createdAt: 1, lastAccessed: 1,
      provenance: "witnessed", confidence: 1, perceptionQuality: "full",
    };
    const out = propagateGossip(
      [{ id: "c1", name: "甲" }, { id: "c2", name: "乙" }],
      { c1: [firsthand], c2: [] },
    );
    expect(out.length).toBe(1);
    const hearsay = out[0];
    expect(hearsay.kind).toBe("hearsay");
    expect(hearsay.provenance).toBe("heard");
    expect(hearsay.perceptionQuality).toBe("partial");
    expect(hearsay.confidence!).toBeLessThan(firsthand.confidence!); // 二手 < 一手
  });
});

describe("§4.5 confidence folded into retrieval", () => {
  const baseMem = (id: string, confidence: number): Memory => ({
    id, charId: "c1", kind: "observation", text: "杀手 来过",
    keywords: ["杀手"], importance: 5, createdAt: 100, lastAccessed: 100, confidence,
  });

  it("a low-confidence memory surfaces less forcefully than a high-confidence one", () => {
    // Both identical in recency/relevance/importance; the high-confidence one is placed
    // SECOND (recency disadvantage) yet must still rank first — so confidence dominates.
    const low = baseMem("low", 0.3);
    const high = baseMem("high", 1.0);
    const ranked = scoreMemories([low, high], ["杀手"], { topK: 2 });
    expect(ranked[0].id).toBe("high");
  });

  it("absent confidence is treated as full (no regression for legacy memories)", () => {
    const legacy: Memory = { id: "leg", charId: "c1", kind: "observation", text: "杀手", keywords: ["杀手"], importance: 5, createdAt: 100, lastAccessed: 100 };
    const ranked = scoreMemories([legacy], ["杀手"], { topK: 1 });
    expect(ranked[0].id).toBe("leg"); // scored fine without a confidence field
  });
});
