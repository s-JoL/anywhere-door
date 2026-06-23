import type { WorldSeed, WorldState, Character, ChatMessage, Memory } from "../types";
import { fillPlaceholders, applyOriginal, RP_PRESET, POST_HISTORY_REINFORCEMENT } from "./preset";
import { retrieveLore, formatLore } from "../world/lore";

/** 去掉角色误加在开头的「自己名字：」前缀。 */
export function stripSpeakerPrefix(name: string, text: string): string {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`^\\s*${esc}\\s*[:：]\\s*`), "");
}

export function presentCharacters(seed: WorldSeed, state: WorldState): Character[] {
  const loc = state.locations[state.currentLocationId];
  if (!loc) return [];
  return loc.presentCharacterIds
    .map((id) => seed.characters.find((c) => c.id === id))
    .filter((c): c is Character => !!c);
}

/** 该角色**主观可见**的当前场景描述（不含他人内心/秘密）。 */
export function visibleScene(state: WorldState, self: Character): string {
  const loc = state.locations[state.currentLocationId];
  const others = loc.presentCharacterIds
    .filter((id) => id !== self.id)
    .map((id) => {
      const name = state.roster[id]?.name ?? id;
      const cond = state.roster[id]?.condition;
      return cond ? `${name}（${cond}）` : name;
    })
    .join("、");
  const objs = loc.objectIds
    .map((id) => {
      const o = state.objects[id];
      if (!o) return null;
      return o.state ? `${o.name}（${o.state}）` : o.name;
    })
    .filter(Boolean)
    .join("、");
  const playerCondition = state.roster["you"]?.condition;
  return [
    `地点：${loc.name}——${loc.description ?? loc.gist}`,
    `时间：第${state.time.day}天 ${state.time.clock}，${state.time.lighting}`,
    others ? `在场：${others}` : "",
    objs ? `可见物：${objs}` : "",
    playerCondition ? `你此刻：${playerCondition}` : "",
  ].filter(Boolean).join("\n");
}

export function buildCharacterPrompt(
  seed: WorldSeed,
  state: WorldState,
  character: Character,
  ctx: { memories?: Memory[]; recent?: Memory[] } = {},
): ChatMessage[] {
  const vars = { char: character.name, user: "你" };

  const identity = character.identity
    ? `【硬事实(绝不矛盾)】${[character.identity.gender, character.identity.age, character.identity.body, character.identity.hardFacts].filter(Boolean).join("；")}`
    : "";

  const memoryBlock = ctx.memories && ctx.memories.length
    ? `【你记得】（只属于你的主观记忆，别人未必知道）\n${ctx.memories.map((m) => `· ${m.text}`).join("\n")}`
    : "";

  const dispositionBlock = (() => {
    const myRelations = state.relationships?.[character.id];
    if (!myRelations) return "";
    const loc = state.locations[state.currentLocationId];
    const presentIds = new Set([...(loc?.presentCharacterIds ?? []), "you"]);
    const lines: string[] = [];
    for (const [toId, disp] of Object.entries(myRelations)) {
      if (!presentIds.has(toId)) continue;
      const name = toId === "you" ? "你（玩家）" : (state.roster[toId]?.name ?? toId);
      lines.push(`对${name}：${disp}`);
    }
    if (!lines.length) return "";
    return `【你此刻的心态】${lines.join("；")}。让这些态度自然影响你的言行。`;
  })();

  // Build SYSTEM message — layered prefix
  const systemParts: string[] = [
    `【世界观】${seed.worldview}`,
    fillPlaceholders(RP_PRESET, vars),
    `【世界规则·不可变】${seed.rules.physics}（设定：${seed.rules.setting}）`,
    identity,
    `【你的设定】${character.description}`,
    character.systemPrompt?.trim()
      ? fillPlaceholders(applyOriginal(character.systemPrompt, RP_PRESET), vars)
      : "",
    character.goal ? `【你此刻的目标】${character.goal}` : "",
    memoryBlock,
    dispositionBlock,
  ].filter(Boolean);

  const system = systemParts.join("\n\n");
  const msgs: ChatMessage[] = [{ role: "system", content: system }];

  // Recent observations as user-turn context
  for (const m of ctx.recent ?? []) {
    msgs.push({ role: "user", content: m.text });
  }

  // POST-HISTORY tail: scene + break-limits reinforcement (LAST message, recency-anchored)
  const reinforcement = character.postHistoryInstructions?.trim()
    ? fillPlaceholders(applyOriginal(character.postHistoryInstructions, POST_HISTORY_REINFORCEMENT), vars)
    : fillPlaceholders(POST_HISTORY_REINFORCEMENT, vars);

  // Lorebook: surface canon whose keys are on-stage (scene + recent/observed memory)
  // so the world stays consistent. In-character world context — NOT the uncensoring layer.
  const scene = visibleScene(state, character);
  const loreHaystack = [
    scene,
    ...(ctx.recent ?? []).map((m) => m.text),
    ...(ctx.memories ?? []).map((m) => m.text),
  ].join("\n");
  const loreBlock = formatLore(retrieveLore(loreHaystack, state.lore));

  const tail = [
    `【此刻所见】\n${scene}`,
    loreBlock,
    reinforcement,
  ].filter(Boolean).join("\n\n");

  msgs.push({ role: "user", content: tail });

  return msgs;
}
