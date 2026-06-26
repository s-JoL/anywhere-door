import type { WorldSeed, WorldPresentation } from "@/lib/types";

const MAX_DERIVED_ENTRY_ACTION = 16;

function shortAction(text: string): string {
  return text.trim().replace(/\s+/g, "");
}

function compactAction(text: string, fallback: string): string {
  const compact = shortAction(text);
  return compact.length <= MAX_DERIVED_ENTRY_ACTION ? compact : fallback;
}

function deriveEntryAction(seed: WorldSeed): string {
  const openingLoc =
    seed.openingState.locations[seed.openingState.currentLocationId];
  const presentIds = openingLoc?.presentCharacterIds ?? [];
  const firstPresent = seed.characters.find((c) => presentIds.includes(c.id));
  if (firstPresent) return compactAction(`问${firstPresent.name}一句真话`, "问对方一句真话");

  const objectId = openingLoc?.objectIds?.[0];
  const objectName = objectId ? seed.openingState.objects[objectId]?.name : "";
  if (objectName) return compactAction(`伸手触碰${objectName}`, "伸手触碰眼前之物");

  const locationName = openingLoc?.name ?? seed.title;
  return compactAction(`走近${locationName}`, "向前走近");
}

/**
 * Returns the seed's authored presentation if present; otherwise derives a
 * reasonable fallback so every world renders in the feed without authored data.
 */
export function derivePresentation(seed: WorldSeed): WorldPresentation {
  if (seed.presentation) {
    return {
      ...seed.presentation,
      entryAction: seed.presentation.entryAction || deriveEntryAction(seed),
    };
  }

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
    entryAction: deriveEntryAction(seed),
    cast,
    accent: "var(--lamp)",
  };
}
