import type { TasteEvent, TasteEventKind, WorldSeed } from "@/lib/types";
import { tagsOfSeed } from "./tags";

export const EVENT_WEIGHT: Record<TasteEventKind, number> = {
  enter: 1,
  dwell: 3,
  author: 4,
  skip: -0.6,
};

export function computeTasteProfile(
  events: TasteEvent[],
  now: number,
  halfLifeDays = 14,
): Record<string, number> {
  const profile: Record<string, number> = {};
  for (const { kind, tags, at } of events) {
    const ageDays = Math.max(0, (now - at)) / 86_400_000;
    const w = EVENT_WEIGHT[kind] * Math.pow(0.5, ageDays / halfLifeDays);
    for (const tag of tags) {
      profile[tag] = (profile[tag] ?? 0) + w;
    }
  }
  return profile;
}

export function scoreSeed(seed: WorldSeed, profile: Record<string, number>): number {
  const tags = tagsOfSeed(seed);
  if (tags.length === 0) return 0;
  const sum = tags.reduce((acc, t) => acc + (profile[t] ?? 0), 0);
  return sum / tags.length;
}
