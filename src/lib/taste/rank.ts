/**
 * rank.ts — taste-aware feed ranking
 *
 * Pure, deterministic (no Math.random, no Date, no I/O).
 */
import type { WorldSeed } from "@/lib/types";
import { scoreSeed, } from "./profile";
import { tagsOfSeed } from "./tags";

// ---------------------------------------------------------------------------
// tagSim — Jaccard similarity between two tag arrays
// ---------------------------------------------------------------------------
export function tagSim(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

// ---------------------------------------------------------------------------
// noveltyOf — fraction of seed tags absent from profile or with ≤0 weight
// ---------------------------------------------------------------------------
export function noveltyOf(seed: WorldSeed, profile: Record<string, number>): number {
  const tags = tagsOfSeed(seed);
  if (tags.length === 0) return 0;
  const novelCount = tags.filter((t) => (profile[t] ?? 0) <= 0).length;
  return novelCount / tags.length;
}

// ---------------------------------------------------------------------------
// RankOpts
// ---------------------------------------------------------------------------
export interface RankOpts {
  exploreEvery?: number; // default 4 — every Nth slot (1-based) is explore
  mmrLambda?: number;    // default 0.5 — diversity penalty weight
  freshPenalty?: number; // default 0.5 — subtracted from base score for recently-seen seeds (exact id)
  /**
   * Category-level 防腻: tag → recent prevalence in [0,1] across recently-seen seeds.
   * A seed sharing tags with the recent feed is damped even if its own id is fresh.
   */
  recentTags?: Record<string, number>;
  catFreshPenalty?: number; // default 0.5 — weight of the category-staleness penalty
}

// ---------------------------------------------------------------------------
// rankFeed — greedy MMR selection with ε-explore slots
// ---------------------------------------------------------------------------
export function rankFeed(
  seeds: WorldSeed[],
  profile: Record<string, number>,
  recentlySeen: Set<string>,
  opts?: RankOpts,
): WorldSeed[] {
  const exploreEvery = opts?.exploreEvery ?? 4;
  const mmrLambda    = opts?.mmrLambda    ?? 0.5;
  const freshPenalty = opts?.freshPenalty ?? 0.5;
  const recentTags   = opts?.recentTags;
  const catFreshPenalty = opts?.catFreshPenalty ?? 0.5;

  if (seeds.length === 0) return [];

  // Precompute base scores and tag lists
  const baseScore   = new Map<string, number>();
  const tagCache    = new Map<string, string[]>();
  const noveltyCache = new Map<string, number>();

  for (const seed of seeds) {
    const tags = tagsOfSeed(seed);
    let b = scoreSeed(seed, profile) - (recentlySeen.has(seed.id) ? freshPenalty : 0);
    if (recentTags && tags.length > 0) {
      // Mean recent-prevalence over this seed's tags → category staleness penalty.
      const overlap = tags.reduce((acc, t) => acc + (recentTags[t] ?? 0), 0) / tags.length;
      b -= catFreshPenalty * overlap;
    }
    baseScore.set(seed.id, b);
    tagCache.set(seed.id, tags);
    noveltyCache.set(seed.id, noveltyOf(seed, profile));
  }

  const remaining = new Map<string, WorldSeed>(seeds.map((s) => [s.id, s]));
  const picked: WorldSeed[] = [];

  while (remaining.size > 0) {
    const i = picked.length; // 0-based position being filled

    // Determine if this is an explore slot: (i+1) % exploreEvery === 0
    const isExploreSlot = exploreEvery > 0 && (i + 1) % exploreEvery === 0;

    // Check if any explore-worthy seeds remain
    const hasNovelRemainder = isExploreSlot
      ? Array.from(remaining.values()).some((s) => (noveltyCache.get(s.id) ?? 0) > 0)
      : false;

    const useExplore = isExploreSlot && hasNovelRemainder;

    // Helper: compute max similarity to already-picked seeds
    function maxSimToPicked(seed: WorldSeed): number {
      if (picked.length === 0) return 0;
      const tags = tagCache.get(seed.id)!;
      let max = 0;
      for (const p of picked) {
        const sim = tagSim(tags, tagCache.get(p.id)!);
        if (sim > max) max = sim;
      }
      return max;
    }

    // Tie-break comparator: higher base score wins, then id ascending (lexicographic)
    function tieBreak(a: WorldSeed, b: WorldSeed): number {
      const ba = baseScore.get(a.id) ?? 0;
      const bb = baseScore.get(b.id) ?? 0;
      if (ba !== bb) return bb - ba; // higher first
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // id ascending
    }

    let best: WorldSeed | null = null;
    let bestScore = -Infinity;

    for (const seed of remaining.values()) {
      const simPenalty = mmrLambda * maxSimToPicked(seed);
      let score: number;

      if (useExplore) {
        const nov = noveltyCache.get(seed.id) ?? 0;
        if (nov <= 0) continue; // skip non-novel seeds in explore slot
        score = nov - simPenalty;
      } else {
        score = (baseScore.get(seed.id) ?? 0) - simPenalty;
      }

      if (
        best === null ||
        score > bestScore ||
        (score === bestScore && tieBreak(seed, best) < 0)
      ) {
        best = seed;
        bestScore = score;
      }
    }

    // Fallback: if explore slot found no novel seed (shouldn't happen after hasNovelRemainder check,
    // but guard anyway), fall back to exploit
    if (best === null) {
      for (const seed of remaining.values()) {
        const simPenalty = mmrLambda * maxSimToPicked(seed);
        const score = (baseScore.get(seed.id) ?? 0) - simPenalty;
        if (
          best === null ||
          score > bestScore ||
          (score === bestScore && tieBreak(seed, best) < 0)
        ) {
          best = seed;
          bestScore = score;
        }
      }
    }

    if (best === null) break; // shouldn't happen

    picked.push(best);
    remaining.delete(best.id);
  }

  return picked;
}
