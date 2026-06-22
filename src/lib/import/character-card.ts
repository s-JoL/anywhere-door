/**
 * SillyTavern / Character Card V2 (+ V1, V3) import utilities.
 * Spec: https://github.com/malfoyslastname/character-card-spec-v2
 *
 * V1: flat JSON fields (no spec/data wrapper)
 * V2: { spec:"chara_card_v2", spec_version:"2.0", data:{...} }
 * V3: { spec:"chara_card_v3", data:{...} } — treat like V2
 *
 * PNG encoding: JSON is base64-encoded in a tEXt chunk.
 *   Keyword "ccv3" takes precedence over "chara".
 *
 * NOTE: character_book / lorebook is intentionally ignored (deferred).
 * NOTE: {{char}}/{{user}} macros in card text are left as-is; resolved at prompt time.
 */

import { readPngTextChunks } from "./png";
import type { Character, ModelConfig, WorldRules, WorldSeed, WorldState } from "../types";

// ---------------------------------------------------------------------------
// Base64 decode — works in browser (atob) and Node (Buffer)
// ---------------------------------------------------------------------------
function base64Decode(b64: string): string {
  if (typeof atob === "function") {
    return atob(b64);
  }
  // Node environment
  return Buffer.from(b64, "base64").toString("latin1");
}

// ---------------------------------------------------------------------------
// PNG → card JSON
// ---------------------------------------------------------------------------

/**
 * Given raw PNG bytes, extract and parse the embedded character card JSON.
 * Prefers "ccv3" keyword over "chara". Returns null on any failure.
 */
export function extractCardJson(bytes: Uint8Array): unknown | null {
  try {
    const chunks = readPngTextChunks(bytes);
    const raw = chunks["ccv3"] ?? chunks["chara"];
    if (!raw) return null;
    const decoded = base64Decode(raw);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// File dispatcher
// ---------------------------------------------------------------------------

/**
 * Parse a character card from either a .json file or a PNG file.
 * Returns the raw card object (may be V1 flat or V2/V3 wrapped) or null.
 */
export function parseCardFile(fileName: string, bytes: Uint8Array): unknown | null {
  try {
    if (fileName.toLowerCase().endsWith(".json")) {
      const text = new TextDecoder("utf-8").decode(bytes);
      return JSON.parse(text);
    }
    return extractCardJson(bytes);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------

function toSlug(name: string, suffix: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^\x20-\x7e]/g, "") // strip non-ASCII
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return (ascii || "char") + "-" + suffix;
}

// ---------------------------------------------------------------------------
// Card → WorldSeed
// ---------------------------------------------------------------------------

/**
 * Convert a parsed character card object into a playable WorldSeed.
 * Returns null if the card has no `name` field.
 *
 * @param card        Raw parsed card (V1 flat or V2/V3 { data:{} })
 * @param modelConfig ModelConfig to embed (copied from current app config)
 * @param now         Timestamp for createdAt
 * @param idSuffix    Short unique suffix (e.g. random hex or timestamp fragment)
 */
export function cardToSeed(
  card: unknown,
  modelConfig: ModelConfig,
  now: number,
  idSuffix: string,
): WorldSeed | null {
  try {
    // Normalise V2/V3 wrapper vs V1 flat
    const c = card as Record<string, unknown>;
    const d = (c?.data as Record<string, unknown> | undefined) ?? c;

    const name = typeof d?.name === "string" ? d.name.trim() : "";
    if (!name) return null;

    const charId = "c-" + toSlug(name, idSuffix);

    // Build description from available fields
    const descParts: string[] = [];
    if (typeof d.description === "string" && d.description.trim()) {
      descParts.push(d.description.trim());
    }
    if (typeof d.personality === "string" && d.personality.trim()) {
      descParts.push("性格：" + d.personality.trim());
    }
    if (typeof d.mes_example === "string" && d.mes_example.trim()) {
      descParts.push("对话范例：\n" + d.mes_example.trim());
    }

    const character: Character = {
      id: charId,
      name,
      description: descParts.join("\n\n"),
      ...(typeof d.system_prompt === "string" && d.system_prompt.trim()
        ? { systemPrompt: d.system_prompt.trim() }
        : {}),
      ...(typeof d.post_history_instructions === "string" && d.post_history_instructions.trim()
        ? { postHistoryInstructions: d.post_history_instructions.trim() }
        : {}),
    };

    const scenarioText =
      typeof d.scenario === "string" ? d.scenario.trim() : "";
    const creatorNotes =
      typeof d.creator_notes === "string" ? d.creator_notes.trim() : "";

    const worldview: string =
      scenarioText || creatorNotes || "与「" + name + "」的相遇。";

    const rules: WorldRules = {
      physics: "现实世界物理，无超自然，除非设定另有说明。",
      setting: "由角色卡设定。",
      redLines: ["仅限成年人之间的虚构创作；排除任何未成年人相关内容。"],
    };

    const locationDescription = scenarioText || worldview;
    const openingState: WorldState = {
      currentLocationId: "scene",
      time: { day: 1, clock: "此刻", lighting: "平常" },
      locations: {
        scene: {
          id: "scene",
          name: "与" + name + "的场景",
          detail: "fleshed",
          gist: worldview.slice(0, 40),
          description: locationDescription,
          connections: [],
          presentCharacterIds: [charId],
          objectIds: [],
        },
      },
      objects: {},
      roster: { [charId]: { name } },
      flags: {},
      tension: 0,
    };

    const seed: WorldSeed = {
      id: "seed-import-" + idSuffix,
      title: name,
      worldview,
      rules,
      openingState,
      characters: [character],
      modelConfig,
      createdAt: now,
      source: "imported",
    };

    return seed;
  } catch {
    return null;
  }
}
