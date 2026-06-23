import { describe, it, expect } from "vitest";
import { evolveWhileAway, type OffscreenContext } from "../offscreen";
import type { WorldSeed, WorldState, WorldRules } from "@/lib/types";

describe("offscreen evolution seam", () => {
  // Minimal context for testing
  const minimalRules: WorldRules = {
    physics: "standard",
    setting: "test setting",
    redLines: [],
  };

  const minimalState: WorldState = {
    currentLocationId: "loc1",
    time: { day: 1, clock: "12:00", lighting: "day" },
    locations: {
      loc1: {
        id: "loc1",
        name: "Test Location",
        detail: "fleshed",
        gist: "A test location",
        connections: [],
        presentCharacterIds: [],
        objectIds: [],
      },
    },
    objects: {},
    roster: {},
    flags: {},
  };

  const minimalSeed: WorldSeed = {
    id: "seed1",
    title: "Test Seed",
    worldview: "test",
    rules: minimalRules,
    openingState: minimalState,
    characters: [],
    modelConfig: {
      provider: "openrouter",
      apiKey: "",
      model: "test",
      reasoningEnabled: false,
    },
  };

  it("should return empty array (no-op) for any context", async () => {
    const ctx: OffscreenContext = {
      seed: minimalSeed,
      state: minimalState,
      rules: minimalRules,
      msAway: 0,
    };
    const deltas = await evolveWhileAway(ctx);
    expect(deltas).toEqual([]);
  });

  it("should return empty array even with non-zero msAway", async () => {
    const ctx: OffscreenContext = {
      seed: minimalSeed,
      state: minimalState,
      rules: minimalRules,
      msAway: 3600000, // 1 hour
    };
    const deltas = await evolveWhileAway(ctx);
    expect(deltas).toEqual([]);
  });

  it("should return empty array even with llm function provided", async () => {
    const ctx: OffscreenContext = {
      seed: minimalSeed,
      state: minimalState,
      rules: minimalRules,
      msAway: 0,
      llm: async () => ({ content: "test" }),
    };
    const deltas = await evolveWhileAway(ctx);
    expect(deltas).toEqual([]);
  });

  it("seam documents the interface contract for future implementation", async () => {
    // This test ensures that the OffscreenContext interface is well-formed
    // and documents what will be needed when off-screen evolution is implemented
    const ctx: OffscreenContext = {
      seed: minimalSeed,
      state: minimalState,
      rules: minimalRules,
      msAway: 86400000, // 24 hours
      llm: async (_messages, onContent) => {
        onContent?.("streaming content");
        return { content: "result" };
      },
    };
    expect(ctx.msAway).toBe(86400000);
    expect(ctx.llm).toBeDefined();
    const deltas = await evolveWhileAway(ctx);
    expect(deltas).toEqual([]);
  });
});
