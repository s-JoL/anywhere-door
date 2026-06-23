import type { ModelConfig } from "@/lib/types";
import type { Repository } from "@/lib/storage";
import type { LlmFn } from "@/lib/engine/turn";
import { generateWorld, type GenMode } from "./generate";
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

  // explore cadence: every Nth generation is explore. e.g. ratio .25 -> every 4th.
  const period = exploreRatio > 0 ? Math.max(1, Math.round(1 / exploreRatio)) : Infinity;

  let added = 0;
  const maxAttempts = target * 2; // bounded to avoid infinite loops on repeated failures
  let attempt = 0;

  while (existing + added < target && attempt < maxAttempts) {
    const mode: GenMode = (attempt + 1) % period === 0 ? "explore" : "exploit";
    const avoidTitles = seeds.map((s) => s.title);
    const idSuffix = newId("g").slice(2); // stable-ish unique suffix per generation

    const seed = await generateWorld({
      profile,
      mode,
      avoidTitles,
      modelConfig,
      llm,
      idSuffix,
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
