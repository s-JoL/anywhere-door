import { describe, it, expect } from "vitest";
import { tagSim, noveltyOf, rankFeed } from "../rank";
import type { WorldSeed } from "@/lib/types";
import { DEMO_SEED } from "@/lib/world/seed-demo";

// ---------------------------------------------------------------------------
// Helpers to construct predictable seeds
// ---------------------------------------------------------------------------
function makeSeed(
  id: string,
  genre: string,
  mood: string[],
  intensity: "calm" | "charged" | "explicit" = "charged",
): WorldSeed {
  return {
    ...DEMO_SEED,
    id,
    presentation: {
      genre,
      mood,
      intensity,
      hook: "...",
      cast: [],
      accent: "var(--lamp)",
    },
  };
}

// ---------------------------------------------------------------------------
// tagSim
// ---------------------------------------------------------------------------
describe("tagSim", () => {
  it("identical tag lists → 1", () => {
    const tags = ["genre:武侠", "mood:江湖", "intensity:charged"];
    expect(tagSim(tags, tags)).toBe(1);
  });

  it("disjoint tag lists → 0", () => {
    const a = ["genre:武侠", "mood:江湖"];
    const b = ["genre:都市", "mood:现代"];
    expect(tagSim(a, b)).toBe(0);
  });

  it("partial overlap → correct Jaccard", () => {
    const a = ["genre:武侠", "mood:江湖", "mood:侠义"];
    const b = ["genre:武侠", "mood:江湖", "mood:悬疑"];
    // intersection = {genre:武侠, mood:江湖} = 2
    // union = {genre:武侠, mood:江湖, mood:侠义, mood:悬疑} = 4
    expect(tagSim(a, b)).toBeCloseTo(2 / 4, 5);
  });

  it("both empty → 0", () => {
    expect(tagSim([], [])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// noveltyOf
// ---------------------------------------------------------------------------
describe("noveltyOf", () => {
  it("all tags absent from profile → 1", () => {
    const seed = makeSeed("s1", "武侠", ["江湖"]);
    // profile has no relevant keys
    const profile: Record<string, number> = { "genre:都市": 2, "mood:现代": 1 };
    expect(noveltyOf(seed, profile)).toBe(1);
  });

  it("all tags with strong positive weight (>0) → 0", () => {
    const seed = makeSeed("s1", "武侠", ["江湖"]);
    // tagsOfSeed(seed) = ["genre:武侠", "mood:江湖", "intensity:charged"]
    const profile: Record<string, number> = {
      "genre:武侠": 2,
      "mood:江湖": 1.5,
      "intensity:charged": 0.5,
    };
    expect(noveltyOf(seed, profile)).toBe(0);
  });

  it("mixed (half absent/zero, half positive) → ~0.5", () => {
    // Use a seed with 2 tags total: one positive, one absent
    const seed2 = makeSeed("s2", "武侠", []);
    // tags: ["genre:武侠", "intensity:charged"] — 2 tags
    const profile: Record<string, number> = { "genre:武侠": 2 };
    // "genre:武侠" has weight 2 (>0), "intensity:charged" absent (novelty)
    // novelty fraction = 1/2 = 0.5
    expect(noveltyOf(seed2, profile)).toBeCloseTo(0.5, 5);
  });
});

// ---------------------------------------------------------------------------
// rankFeed
// ---------------------------------------------------------------------------
describe("rankFeed", () => {
  const wuxia1 = makeSeed("wuxia-1", "武侠", ["江湖", "侠义"]);
  const wuxia2 = makeSeed("wuxia-2", "武侠", ["江湖", "侠义"]); // near-clone of wuxia1 (same wuxia genre/tags)
  const urban  = makeSeed("urban-1", "都市", ["现代", "悬疑"]);
  const scifi  = makeSeed("scifi-1", "科幻", ["宇宙", "冒险"]);
  const horror = makeSeed("horror-1", "恐怖", ["悬疑", "黑暗"]);
  const xian   = makeSeed("xian-1", "仙侠", ["修真", "飞升"]);
  const rom    = makeSeed("rom-1", "言情", ["浪漫", "甜蜜"]);
  const hist   = makeSeed("hist-1", "历史", ["权谋", "宫廷"]);

  const eightSeeds = [wuxia1, wuxia2, urban, scifi, horror, xian, rom, hist];
  const emptyProfile: Record<string, number> = {};

  // (a) Permutation: output contains same ids as input
  it("(a) permutation: output contains same ids as input", () => {
    const result = rankFeed(eightSeeds, emptyProfile, new Set());
    const inputIds = eightSeeds.map((s) => s.id).sort();
    const outputIds = result.map((s) => s.id).sort();
    expect(outputIds).toEqual(inputIds);
  });

  // (b) Taste ordering: profile favors wuxia; wuxia seed ranks before low-affinity seed
  it("(b) taste ordering: wuxia seed ranks before unrelated seed", () => {
    const profile: Record<string, number> = {
      "genre:武侠": 5,
      "mood:江湖": 3,
      "mood:侠义": 3,
      "intensity:charged": 1,
    };
    const seeds = [urban, wuxia1, scifi];
    const result = rankFeed(seeds, profile, new Set());
    // wuxia1 should rank first (exploit position 0)
    expect(result[0].id).toBe("wuxia-1");
  });

  // (c) Freshness penalty: recentlySeen seed ranks lower than equally fresh seed
  it("(c) freshness penalty: recentlySeen seed ranks lower", () => {
    // Both seeds have same profile affinity (both unknown => 0),
    // but wuxia1 is in recentlySeen => penalty
    const profile: Record<string, number> = {};
    const recentlySeen = new Set(["wuxia-1"]);
    const seeds = [wuxia1, urban];
    const result = rankFeed(seeds, profile, recentlySeen);
    // urban (not recently seen) should beat wuxia1 (penalized)
    expect(result[0].id).toBe("urban-1");
  });

  // (d) MMR diversity: two near-identical high-affinity twins + one different seed
  // With mmrLambda=1.0, the twin penalty (sim=1.0) should cause the different
  // seed to be inserted at position 1 between the two twins.
  it("(d) MMR diversity: different seed not pushed to last position", () => {
    // Profile: genre:武侠 scores 3.75 per seed (4+4+4+3)/4
    //          genre:都市 scores 3.0 per seed  (3+3+3+3)/4
    // wuxia1 wins pos0 (3.75 > 3.0, id 'wuxia-1' < 'wuxia-2')
    // At pos1 with mmrLambda=1.0:
    //   wuxia2: 3.75 - 1.0*tagSim(wuxia,wuxia) = 3.75 - 1.0*1.0 = 2.75
    //   urban:  3.0  - 1.0*tagSim(urban,wuxia) = 3.0  - 1.0*(1/7) ≈ 2.857
    // urban wins → position 1
    const profile: Record<string, number> = {
      "genre:武侠": 4,
      "mood:江湖": 4,
      "mood:侠义": 4,
      "genre:都市": 3,
      "mood:现代": 3,
      "mood:悬疑": 3,
      "intensity:charged": 3,
    };
    const seeds = [wuxia1, wuxia2, urban];
    const result = rankFeed(seeds, profile, new Set(), { mmrLambda: 1.0 });
    // urban should be at position 1 due to MMR diversity penalty on the wuxia twin
    expect(result[1].id).toBe("urban-1");
  });

  // (e) Explore slot: position 3 (0-based) is explore pick
  // exploreEvery=4 means position 3 (i+1=4, 4%4===0) → explore
  it("(e) explore slot: position 3 picks high-novelty seed", () => {
    // Build profile that strongly favors wuxia/urban/scifi/horror
    // but has NO knowledge of "仙侠" → xian is novel
    const profile: Record<string, number> = {
      "genre:武侠": 10,
      "mood:江湖": 5,
      "mood:侠义": 5,
      "genre:都市": 8,
      "mood:现代": 4,
      "mood:悬疑": 4,
      "genre:科幻": 8,
      "mood:宇宙": 4,
      "mood:冒险": 4,
      "genre:恐怖": 7,
      "mood:黑暗": 3,
      "intensity:charged": 2,
    };
    // seeds pool: 5 seeds, all high-affinity + xian (novel)
    const seeds = [wuxia1, urban, scifi, horror, xian];
    const result = rankFeed(seeds, profile, new Set());
    // Position 3 (0-based) is the explore slot (exploreEvery default=4, (3+1)%4===0)
    expect(result[3].id).toBe("xian-1");
  });

  // (f) Cold start: empty profile → full permutation; deterministic
  it("(f) cold start: full permutation and deterministic", () => {
    const result1 = rankFeed(eightSeeds, emptyProfile, new Set());
    const result2 = rankFeed(eightSeeds, emptyProfile, new Set());
    // Both are full permutations
    expect(result1.map((s) => s.id).sort()).toEqual(eightSeeds.map((s) => s.id).sort());
    // Deterministic: same inputs → same outputs
    expect(result1.map((s) => s.id)).toEqual(result2.map((s) => s.id));
  });

  // (g) Category freshness (anti-fatigue by genre, not just exact id):
  // wuxia2 is NOT in recentlySeen by id, but the recent feed was all wuxia.
  // Its slight taste affinity wins pos0 normally, but the category-staleness
  // penalty should flip a fresh-genre seed (urban) ahead of it.
  it("(g) category freshness: a tag-stale seed ranks below a fresh-genre seed", () => {
    const profile: Record<string, number> = { "genre:武侠": 1 };
    const recentTags: Record<string, number> = {
      "genre:武侠": 1, "mood:江湖": 1, "mood:侠义": 1,
    };
    const seeds = [wuxia2, urban];
    // Baseline (no recentTags): affinity puts wuxia2 first
    expect(rankFeed(seeds, profile, new Set())[0].id).toBe("wuxia-2");
    // With category freshness: urban (fresh genre) overtakes the stale wuxia
    const result = rankFeed(seeds, profile, new Set(), { recentTags });
    expect(result[0].id).toBe("urban-1");
  });

  // (h) recentTags is optional & backward compatible — omitting it changes nothing
  it("(h) omitting recentTags preserves prior ranking", () => {
    const profile: Record<string, number> = { "genre:武侠": 1 };
    const a = rankFeed([wuxia2, urban], profile, new Set());
    const b = rankFeed([wuxia2, urban], profile, new Set(), {});
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
  });
});
