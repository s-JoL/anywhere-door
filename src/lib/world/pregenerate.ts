import type { ModelConfig } from "@/lib/types";
import type { Repository } from "@/lib/storage";
import type { LlmFn } from "@/lib/engine/turn";
import {
  generateWorld,
  pickDiverseTargets,
  type GenMode,
  type DiverseTarget,
} from "./generate";
import { derivePresentation } from "@/lib/world/presentation";
import { newId } from "@/lib/id";

export interface EnsurePoolArgs {
  repo: Repository;
  llm: LlmFn;
  modelConfig: ModelConfig;
  profile: Record<string, number>;
  /** Desired number of `source:"generated"` seeds in the pool. Default 4. */
  target?: number;
  /** Roughly this fraction of generations are "explore" (divergent). Default 0.25. */
  exploreRatio?: number;
}

/**
 * Top up the pool of `source:"generated"` seeds to `target`, sequentially
 * (rate-limited; one at a time). Alternates exploit/explore deterministically so
 * the feed gets diversity. Safe-degrades: failures are skipped, never thrown.
 * Returns the number of seeds actually added.
 */
export async function ensureGeneratedPool(args: EnsurePoolArgs): Promise<number> {
  const { repo, llm, modelConfig, profile } = args;
  const target = args.target ?? 4;
  const exploreRatio = args.exploreRatio ?? 0.25;

  let seeds = await safeListSeeds(repo);
  let existing = seeds.filter((s) => s.source === "generated").length;
  if (existing >= target) return 0;

  // Cold = no positive taste weights yet (new user). When cold, an unrestricted
  // model free-runs toward edgy/dark and self-anchors on a motif across the
  // batch — so we deliberately spread across the curated palette instead.
  const cold =
    Object.keys(profile).length === 0 ||
    Object.values(profile).every((v) => v <= 0);

  const slotsToFill = target - existing;

  // Genres currently in the pool (used to skip already-present genres when cold,
  // and to compute over-represented genres for warm anti-clustering).
  const existingGenres = seeds
    .map((s) => {
      try {
        return derivePresentation(s).genre;
      } catch {
        return "";
      }
    })
    .filter(Boolean);

  // Genres appearing ≥2× in the current pool are "over-represented" — steer
  // every generation away from them to break up clustering.
  const overRepresented = (() => {
    const counts: Record<string, number> = {};
    for (const g of existingGenres) counts[g] = (counts[g] ?? 0) + 1;
    return Object.entries(counts)
      .filter(([, c]) => c >= 2)
      .map(([g]) => g);
  })();

  // Pre-plan per-slot diverse targets. Cold: every slot gets a curated target.
  // Warm: only explore slots get a target (a genre far from taste).
  const planned = pickDiverseTargets(slotsToFill, existingGenres);

  // explore cadence: every Nth generation is explore. e.g. ratio .25 -> every 4th.
  const period = exploreRatio > 0 ? Math.max(1, Math.round(1 / exploreRatio)) : Infinity;

  let added = 0;
  const maxAttempts = target * 2; // bounded to avoid infinite loops on repeated failures
  let attempt = 0;

  while (existing + added < target && attempt < maxAttempts) {
    const mode: GenMode = (attempt + 1) % period === 0 ? "explore" : "exploit";
    const avoidTitles = seeds.map((s) => s.title);
    const idSuffix = newId("g").slice(2); // stable-ish unique suffix per generation

    // Decide this slot's forced target.
    let target_: DiverseTarget | undefined;
    if (cold) {
      // Guarantee a spread starter set: every slot gets a curated target.
      target_ = planned[added % planned.length];
    } else if (mode === "explore") {
      // Warm explore: steer to a genre far from taste, drawn from the palette.
      target_ = planned[added % planned.length];
    }
    // Warm exploit slots: no forced target — keep leaning on taste.

    // Over-represented genres to avoid on EVERY slot (warm anti-clustering).
    // When a forced target is set, don't tell it to avoid its own genre.
    const avoidGenres = overRepresented.filter((g) => g !== target_?.genre);

    const seed = await generateWorld({
      profile,
      mode,
      avoidTitles,
      modelConfig,
      llm,
      idSuffix,
      target: target_,
      avoidGenres: avoidGenres.length > 0 ? avoidGenres : undefined,
    });

    if (seed) {
      try {
        await repo.upsertSeed(seed);
        added++;
        seeds = [...seeds, seed]; // keep avoidTitles fresh without re-querying
      } catch {
        // upsert failed — skip, keep going
      }
    }
    attempt++;
  }

  return added;
}

async function safeListSeeds(repo: Repository) {
  try {
    return await repo.listSeeds();
  } catch {
    return [];
  }
}
