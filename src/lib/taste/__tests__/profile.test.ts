import { describe, it, expect } from "vitest";
import { computeTasteProfile, scoreSeed, EVENT_WEIGHT } from "../profile";
import { tagsOfSeed } from "../tags";
import type { TasteEvent } from "@/lib/types";
import { DEMO_SEED } from "@/lib/world/seed-demo";

const NOW = 1_000_000_000_000;
const DAY_MS = 86_400_000;
const HALF_LIFE = 14;

function ev(kind: TasteEvent["kind"], at: number, tags: string[]): TasteEvent {
  return { id: `${kind}-${at}`, kind, seedId: "s1", tags, at };
}

describe("computeTasteProfile", () => {
  it("returns {} for empty events", () => {
    expect(computeTasteProfile([], NOW)).toEqual({});
  });

  it("a recent dwell outweighs a 28-day-old enter for the same tag (decay)", () => {
    const oldEnter = ev("enter", NOW - 28 * DAY_MS, ["genre:悬疑"]);
    const recentDwell = ev("dwell", NOW, ["genre:悬疑"]);
    const profile = computeTasteProfile([oldEnter, recentDwell], NOW, HALF_LIFE);
    // old enter weight = 1 * 0.5^(28/14) = 1 * 0.25 = 0.25
    // recent dwell weight = 3 * 0.5^0 = 3
    // dwell alone (3) > enter alone (0.25)
    const enterWeight = (EVENT_WEIGHT.enter ?? 0) * Math.pow(0.5, 28 / HALF_LIFE);
    const dwellWeight = (EVENT_WEIGHT.dwell ?? 0) * Math.pow(0.5, 0 / HALF_LIFE);
    expect(profile["genre:悬疑"]).toBeCloseTo(enterWeight + dwellWeight);
    expect(dwellWeight).toBeGreaterThan(enterWeight);
  });

  it("skip makes a tag score negative", () => {
    const skip = ev("skip", NOW, ["genre:comedy"]);
    const profile = computeTasteProfile([skip], NOW, HALF_LIFE);
    expect(profile["genre:comedy"]).toBeLessThan(0);
  });
});

describe("scoreSeed", () => {
  it("returns 0 for empty profile (seed tags all unseen)", () => {
    expect(scoreSeed(DEMO_SEED, {})).toBe(0);
  });

  it("returns mean of matching tag scores", () => {
    const seed = { ...DEMO_SEED, presentation: { genre: "A", mood: ["B"], intensity: "calm" as const, hook: "h", entryAction: "开始行动", cast: [] } };
    const profile = { "genre:A": 4, "mood:B": 2, "intensity:calm": 6 };
    const score = scoreSeed(seed, profile);
    // mean of [4, 2, 6] = 4
    expect(score).toBeCloseTo(4);
  });

  it("positive profile gives positive score", () => {
    const seed = { ...DEMO_SEED, presentation: { genre: "X", mood: [], intensity: "charged" as const, hook: "", entryAction: "开始行动", cast: [] } };
    const profile = { "genre:X": 3, "intensity:charged": 1 };
    expect(scoreSeed(seed, profile)).toBeGreaterThan(0);
  });

  it("uses derived tags for presentation-less seeds (score non-zero when profile has matching tags)", () => {
    // DEMO_SEED without presentation should fall back to derived tags containing at least genre and intensity
    const bare = { ...DEMO_SEED, presentation: undefined };
    const tags = tagsOfSeed(bare);
    const profile: Record<string, number> = {};
    for (const t of tags) profile[t] = 5;
    expect(scoreSeed(bare, profile)).toBeGreaterThan(0);
  });
});
