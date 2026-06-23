import type { Delta } from "@/lib/world/delta";
import type { WorldState, WorldRules, WorldSeed } from "@/lib/types";
import type { LlmFn } from "@/lib/engine/turn";

/**
 * Seam for OFF-SCREEN world evolution.
 *
 * When a player returns to a world after time away, the world may have plausibly
 * changed while they were gone. This is the single extension point where that
 * lazy, on-return evolution would be implemented: it should PROPOSE Deltas (the
 * same currency the World Reactor uses), which the caller then runs through
 * validateDelta/applyDelta before committing.
 *
 * NOT IMPLEMENTED YET (no implementation planned). Currently a no-op that returns
 * no changes, so behavior is unchanged. To implement later: use ctx.llm + ctx.msAway
 * to summarize/advance what happened while away and return the resulting Deltas.
 */
export interface OffscreenContext {
  seed: WorldSeed;
  state: WorldState;
  rules: WorldRules;
  msAway: number; // elapsed real time since the player's last interaction (0 when unknown)
  llm?: LlmFn;
}

export async function evolveWhileAway(_ctx: OffscreenContext): Promise<Delta[]> {
  return []; // no-op seam — see doc comment
}
