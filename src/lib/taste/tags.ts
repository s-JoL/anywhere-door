import type { WorldSeed } from "@/lib/types";
import { derivePresentation } from "@/lib/world/presentation";

export function tagsOfSeed(seed: WorldSeed): string[] {
  const p = derivePresentation(seed);
  const raw = [
    "genre:" + p.genre,
    ...p.mood.map((m) => "mood:" + m),
    "intensity:" + p.intensity,
  ];
  // dedup, drop empties
  return [...new Set(raw.filter(Boolean))];
}
