/**
 * §5.9 Acquisition funnel (local-first metrics).
 *
 * Extends the local taste-event stream into the acquisition funnel:
 *   card-dwell → open-door → first-action → ten-minute-retain → first-consequence
 *   → return → pin
 * and the keyless conversion cliff:
 *   prebaked-taste → key-add → first-action
 * `first-consequence` fires on the first player-caused *anchored* fact. Everything is
 * local-first — it never reaches a server and never reaches characters (it is
 * out-of-world, like the Studio trace).
 *
 * Recording is fire-and-forget; analysis (`computeFunnel`) is pure.
 */

import type { Repository } from "../storage";
import type { TasteEvent, WorldSeed } from "../types";
import { tagsOfSeed } from "./tags";

export const FUNNEL_STAGES = [
  "card-dwell",
  "open-door",
  "first-action",
  "ten-minute-retain",
  "first-consequence",
  "return",
  "pin",
  "prebaked-taste",
  "key-add",
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

const CONVERSION_STEPS: Array<readonly [FunnelStage, FunnelStage]> = [
  ["card-dwell", "open-door"],
  ["open-door", "first-action"],
  ["first-action", "ten-minute-retain"],
  ["ten-minute-retain", "first-consequence"],
  ["first-consequence", "return"],
  ["return", "pin"],
  ["prebaked-taste", "key-add"],
  ["key-add", "first-action"],
];

/** Record one funnel stage for a seed (local-first, fire-and-forget). */
export function recordFunnel(repo: Repository, stage: FunnelStage, seed: WorldSeed): void {
  const at = Date.now();
  const event: TasteEvent = { id: `${stage}-${at}-${seed.id}`, kind: stage, seedId: seed.id, tags: tagsOfSeed(seed), at };
  void repo.recordTasteEvent(event);
}

/** Top-of-funnel: the user stayed on a door long enough to judge it. */
export function recordCardDwell(repo: Repository, seed: WorldSeed): void {
  recordFunnel(repo, "card-dwell", seed);
}

/** Keyless on-ramp: the visitor saw a scripted, non-reactive sample. */
export function recordPrebakedTaste(repo: Repository, seed: WorldSeed): void {
  recordFunnel(repo, "prebaked-taste", seed);
}

/** Keyless-to-reactive cliff: the visitor added a key after a sample handoff. */
export function recordKeyAdd(repo: Repository, seed: WorldSeed): void {
  recordFunnel(repo, "key-add", seed);
}

export interface FunnelReport {
  /** Count of events at each stage. */
  counts: Record<FunnelStage, number>;
  /** Stage-to-stage conversion (stage[i+1] / stage[i]); 0 when the prior stage is empty. */
  conversion: Record<string, number>;
}

const ZERO_COUNTS = (): Record<FunnelStage, number> =>
  Object.fromEntries(FUNNEL_STAGES.map((s) => [s, 0])) as Record<FunnelStage, number>;

/** Pure: fold a taste-event stream into per-stage counts + step conversions. */
export function computeFunnel(events: TasteEvent[]): FunnelReport {
  const counts = ZERO_COUNTS();
  for (const e of events) {
    if ((FUNNEL_STAGES as readonly string[]).includes(e.kind)) counts[e.kind as FunnelStage]++;
  }
  const conversion: Record<string, number> = {};
  for (const [from, to] of CONVERSION_STEPS) {
    conversion[`${from}→${to}`] = counts[from] > 0 ? counts[to] / counts[from] : 0;
  }
  return { counts, conversion };
}
