import type { WorldSeed, WorldPresentation } from "@/lib/types";

/**
 * Returns the seed's authored presentation if present; otherwise derives a
 * reasonable fallback so every world renders in the feed without authored data.
 */
export function derivePresentation(seed: WorldSeed): WorldPresentation {
  if (seed.presentation) return seed.presentation;

  // Derive from seed data
  const openingLoc =
    seed.openingState.locations[seed.openingState.currentLocationId];

  // Hook: prefer opening location description, fall back to worldview
  const hookSource =
    (openingLoc?.description ?? "").trim() || seed.worldview.trim();
  const hook = hookSource.slice(0, 90);

  // Cast: characters present in the opening location, at most 2
  const presentIds = openingLoc?.presentCharacterIds ?? [];
  const cast = seed.characters
    .filter((c) => presentIds.includes(c.id))
    .slice(0, 2)
    .map((c) => ({
      name: c.name,
      line: c.description.split(/[。\n]/)[0].slice(0, 24),
    }));

  return {
    genre: "故事",
    mood: [],
    intensity: "charged",
    hook,
    cast,
    accent: "var(--lamp)",
  };
}
