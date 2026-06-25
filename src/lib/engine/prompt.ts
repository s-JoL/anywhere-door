import type { WorldSeed, WorldState, Character, ChatMessage, Memory } from "../types";
import { fillPlaceholders, applyOriginal, RP_PRESET, POST_HISTORY_REINFORCEMENT } from "./preset";
import { formatLore } from "../world/lore";
import { resolvePerception, type CharacterProjection } from "./perception";

// visibleScene lives on the perception boundary now; re-exported for back-compat.
export { visibleScene } from "./perception";

/** Strip the "own name:" prefix a character may mistakenly prepend. */
export function stripSpeakerPrefix(name: string, text: string): string {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`^\\s*${esc}\\s*[:：]\\s*`), "");
}

export function presentCharacters(seed: WorldSeed, state: WorldState): Character[] {
  const loc = state.locations[state.currentLocationId];
  if (!loc) return [];
  return loc.presentCharacterIds
    .map((id) => seed.characters.find((c) => c.id === id) ?? state.characters?.[id])
    .filter((c): c is Character => !!c);
}

/**
 * Renderer: a CharacterProjection → ChatMessage[]. This is the prose/wording layer —
 * the only place story-locale prompt phrasing lives (§15.14), kept out of the
 * projection structure. It reads ONLY the projection (+ world constants from seed);
 * it never re-reads raw state, so it cannot widen what the character perceives.
 */
export function renderProjection(seed: WorldSeed, p: CharacterProjection): ChatMessage[] {
  const character = p.self;
  const vars = { char: character.name, user: "你" };

  const identity = p.identity
    ? `【硬事实(绝不矛盾)】${[p.identity.gender, p.identity.age, p.identity.body, p.identity.hardFacts].filter(Boolean).join("；")}`
    : "";

  // §5.4 render subjective record fields into the narrative: low confidence adds an "uncertain" hedge, subjective interpretation rides along — the character acts on what they **believe**.
  const memLine = (m: CharacterProjection["memories"][number]): string => {
    const hedge = (m.confidence ?? 1) < 0.5 ? "（不确定）" : "";
    const interp = m.interpretation?.trim() ? `（我的理解：${m.interpretation.trim()}）` : "";
    return `· ${hedge}${m.text}${interp}`;
  };
  const memoryBlock = p.memories.length
    ? `【你记得】（只属于你的主观记忆，别人未必知道）\n${p.memories.map(memLine).join("\n")}`
    : "";

  const dispositionBlock = p.stance.length
    ? `【你此刻的心态】${p.stance.map((s) => `对${s.name}：${s.phrase}`).join("；")}。让这些态度自然影响你的言行。`
    : "";

  // Build SYSTEM message — layered prefix
  const systemParts: string[] = [
    `【世界观】${seed.worldview}`,
    fillPlaceholders(RP_PRESET, vars),
    `【世界规则·不可变】${seed.rules.physics}（设定：${seed.rules.setting}）`,
    identity,
    `【你的设定】${p.description}`,
    p.systemPrompt?.trim()
      ? fillPlaceholders(applyOriginal(p.systemPrompt, RP_PRESET), vars)
      : "",
    p.goal ? `【你此刻的目标】${p.goal}` : "",
    memoryBlock,
    dispositionBlock,
  ].filter(Boolean);

  const system = systemParts.join("\n\n");
  const msgs: ChatMessage[] = [{ role: "system", content: system }];

  // Recent observations as user-turn context
  for (const m of p.recent) {
    msgs.push({ role: "user", content: m.text });
  }

  // POST-HISTORY tail: scene + break-limits reinforcement (LAST message, recency-anchored)
  const reinforcement = p.postHistoryInstructions?.trim()
    ? fillPlaceholders(applyOriginal(p.postHistoryInstructions, POST_HISTORY_REINFORCEMENT), vars)
    : fillPlaceholders(POST_HISTORY_REINFORCEMENT, vars);

  const loreBlock = formatLore(p.triggeredLore);

  const tail = [
    `【此刻所见】\n${p.visibleScene}`,
    loreBlock,
    reinforcement,
  ].filter(Boolean).join("\n\n");

  msgs.push({ role: "user", content: tail });

  return msgs;
}

/**
 * Thin compatibility entry: resolve a projection from already-scored memories/recent
 * (the caller-supplied path), then render. Runtime turns call `resolvePerception` +
 * `renderProjection` directly so memory retrieval lives on the boundary.
 */
export function buildCharacterPrompt(
  seed: WorldSeed,
  state: WorldState,
  character: Character,
  ctx: { memories?: Memory[]; recent?: Memory[] } = {},
): ChatMessage[] {
  const projection = resolvePerception({ seed, state, memories: ctx.memories, recent: ctx.recent }, character);
  return renderProjection(seed, projection);
}
