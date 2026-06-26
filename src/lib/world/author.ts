import { newId } from "@/lib/id";
import type { WorldSeed, ModelConfig, Character, WorldState } from "@/lib/types";
import { derivePresentation } from "@/lib/world/presentation";
import { DEFAULT_NARRATION_RULE } from "@/lib/world/narration";

export interface CharDraft {
  name: string;
  description: string;
  gender?: string;
  body?: string;
  goal?: string;
  systemPrompt?: string;
  postHistoryInstructions?: string;
  present?: boolean;
}

export interface WorldDraft {
  title: string;
  worldview: string;
  physics?: string;
  setting?: string;
  redLines?: string[];
  sceneName?: string;
  sceneDescription?: string;
  clock?: string;
  lighting?: string;
  characters: CharDraft[];
  // Presentation (optional — derived from seed if omitted)
  genre?: string;
  mood?: string[];
  intensity?: "calm" | "charged" | "explicit";
  hook?: string;
  entryAction?: string;
  narrationRule?: string;
}

export function buildSeedFromDraft(
  draft: WorldDraft,
  modelConfig: ModelConfig,
  now: number,
): WorldSeed | null {
  if (!draft.title.trim()) return null;

  const namedChars = draft.characters.filter((c) => c.name.trim());
  if (namedChars.length === 0) return null;

  const characters: Character[] = namedChars.map((cd) => {
    const char: Character = {
      id: newId("c"),
      name: cd.name.trim(),
      description: cd.description,
    };
    if (cd.gender || cd.body) {
      char.identity = {};
      if (cd.gender) char.identity.gender = cd.gender;
      if (cd.body) char.identity.body = cd.body;
    }
    if (cd.goal?.trim()) char.goal = cd.goal.trim();
    if (cd.systemPrompt?.trim()) char.systemPrompt = cd.systemPrompt.trim();
    if (cd.postHistoryInstructions?.trim())
      char.postHistoryInstructions = cd.postHistoryInstructions.trim();
    return char;
  });

  const presentIds = namedChars
    .map((cd, i) => ({ cd, char: characters[i] }))
    .filter(({ cd }) => cd.present !== false)
    .map(({ char }) => char.id);

  const roster: WorldState["roster"] = {};
  for (const char of characters) {
    roster[char.id] = { name: char.name };
  }

  const locName = draft.sceneName?.trim() || draft.title.trim();
  const locDesc = draft.sceneDescription?.trim() || draft.worldview;
  const openingState: WorldState = {
    currentLocationId: "scene",
    time: {
      day: 1,
      clock: draft.clock?.trim() || "此刻",
      lighting: draft.lighting?.trim() || "平常",
    },
    locations: {
      scene: {
        id: "scene",
        name: locName,
        detail: "fleshed",
        gist: locDesc.slice(0, 40),
        description: locDesc,
        connections: [],
        presentCharacterIds: presentIds,
        objectIds: [],
      },
    },
    objects: {},
    roster,
    flags: {},
    tension: 0,
  };

  const rules = {
    physics:
      draft.physics?.trim() ||
      "现实世界物理，无超自然，除非世界观另有说明。",
    setting: draft.setting?.trim() || draft.title.trim(),
    redLines:
      draft.redLines && draft.redLines.length > 0
        ? draft.redLines
        : ["仅限成年人之间的虚构创作；排除任何未成年人相关内容。"],
    narrationRule: draft.narrationRule?.trim() || DEFAULT_NARRATION_RULE,
  };

  const partialSeed: WorldSeed = {
    id: "seed-created-" + newId(""),
    title: draft.title.trim(),
    worldview: draft.worldview.trim(),
    rules,
    openingState,
    characters,
    modelConfig,
    createdAt: now,
    source: "created",
  };

  const basePres = derivePresentation(partialSeed);
  return {
    ...partialSeed,
    presentation: {
      ...basePres,
      ...(draft.genre ? { genre: draft.genre } : {}),
      ...(draft.mood ? { mood: draft.mood } : {}),
      ...(draft.intensity ? { intensity: draft.intensity } : {}),
      ...(draft.hook ? { hook: draft.hook } : {}),
      ...(draft.entryAction ? { entryAction: draft.entryAction } : {}),
    },
  };
}
