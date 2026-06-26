import { describe, it, expect } from "vitest";
import { evolveWhileAway, buildOffscreenPrompt, type OffscreenContext } from "../offscreen";
import type { WorldSeed, WorldState, WorldRules, ChatMessage } from "@/lib/types";

const rules: WorldRules = { physics: "无超自然", setting: "test", redLines: [] };
const state: WorldState = {
  currentLocationId: "loc1",
  time: { day: 1, clock: "12:00", lighting: "day" },
  locations: { loc1: { id: "loc1", name: "测试地", detail: "fleshed", gist: "一处测试地点", connections: [], presentCharacterIds: ["c1"], objectIds: [] } },
  objects: {},
  roster: { c1: { name: "阿岚" } },
  flags: {},
};
const seed = { id: "s1", title: "T", worldview: "雨夜霓虹城", rules, openingState: state, characters: [], modelConfig: { provider: "openrouter", apiKey: "", model: "x", reasoningEnabled: false } } as WorldSeed;

const HOUR = 3_600_000;
const deltaLlm = async (_m: ChatMessage[]) => ({ content: '[{"kind":"advanceTime","clock":"黄昏","dayDelta":0},{"kind":"setCondition","entityId":"c1","condition":"打了个盹，眼神松了些"}]' });

describe("evolveWhileAway (offstage evolution)", () => {
  function ctx(over: Partial<OffscreenContext>): OffscreenContext {
    return { seed, state, rules, msAway: 0, ...over };
  }

  it("does nothing when there is no llm", async () => {
    expect(await evolveWhileAway(ctx({ msAway: 24 * HOUR }))).toEqual([]);
  });
  it("does nothing when the player was away less than the threshold", async () => {
    expect(await evolveWhileAway(ctx({ msAway: 10 * 60_000, llm: deltaLlm }))).toEqual([]); // 10 min
  });
  it("proposes plausible deltas when away long enough", async () => {
    const deltas = await evolveWhileAway(ctx({ msAway: 5 * HOUR, llm: deltaLlm }));
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.some((d) => d.kind === "setCondition")).toBe(true);
  });
  it("returns [] when the llm yields no parseable deltas", async () => {
    expect(await evolveWhileAway(ctx({ msAway: 5 * HOUR, llm: async () => ({ content: "一切如常。" }) }))).toEqual([]);
  });
  it("returns [] on llm error (graceful)", async () => {
    expect(await evolveWhileAway(ctx({ msAway: 5 * HOUR, llm: async () => { throw new Error("x"); } }))).toEqual([]);
  });
});

describe("buildOffscreenPrompt", () => {
  it("includes worldview and the hours-away figure", () => {
    const all = buildOffscreenPrompt(seed, state, 7).map((m) => m.content).join("\n");
    expect(all).toContain("雨夜霓虹城");
    expect(all).toContain("7");
  });

  it("instructs unknown pressure-line advancement to include a player-facing sign", () => {
    const all = buildOffscreenPrompt(seed, state, 7).map((m) => m.content).join("\n");
    expect(all).toContain("nextSign");
    expect(all).toContain("玩家可见");
  });
});
