/**
 * flesh.ts — stub→fleshed lazy fleshing (axis 2: grow on demand).
 *
 * When the player first steps into a `detail:"stub"` location, the world **fleshes
 * it out on the spot** into a richer in-scene description and crystallizes it to
 * `fleshed`. Engine-triggered (not a reactor proposal), still goes through the
 * fleshLocation delta.
 */
import type { WorldSeed, WorldState, Location, WorldObject, Character, ChatMessage } from "../types";
import type { Delta } from "./delta";
import type { LlmFn } from "@/lib/engine/turn";

const FLESH_SYSTEM =
  "你是世界环境作家。给定世界观与一处地点的名称、一句话要旨，写出 1–2 句此刻踏入者**外部可见**的临场环境描述" +
  "（光线/声音/气味/陈设/天气这类），贴合世界观、与要旨一致。不要引入有名字的新角色或新物体，不要写任何人的内心，" +
  "不要替玩家叙述其动作。只输出这段描述本身，不要引号、不要多余文字。";

const FLESH_OBJECT_SYSTEM =
  "你是世界物件作家。给定世界观、当前地点与一个已经被玩家注意到的 stub 物件，写出 1 句外部可见的具体状态。" +
  "只描述这个物件本身的可见细节、痕迹、材质、状态或异常；不要引入新命名实体，不要写人物内心，不要替玩家行动。" +
  "只输出这句状态描述本身，不要引号、不要多余文字。";

const FLESH_CHARACTER_SYSTEM =
  "你是世界角色作家。给定世界观、当前地点与一个已经被玩家注意到的 stub 角色，把它充实成世界原生角色。" +
  "输出严格 JSON：{\"description\":\"一句外部可见身份/气质/处境描述\",\"goal\":\"一句当前目标\"}。" +
  "不要让角色知道出世界控制信息，不要写玩家未公开的秘密，不要让角色像从玩家的门外进入。";

export function buildFleshPrompt(seed: WorldSeed, loc: Location): ChatMessage[] {
  const user = `【世界观】${seed.worldview}\n【地点】${loc.name}\n【要旨】${loc.gist || "（无）"}\n\n请写这处地点此刻的临场描述：`;
  return [
    { role: "system", content: FLESH_SYSTEM },
    { role: "user", content: user },
  ];
}

export function buildFleshObjectPrompt(seed: WorldSeed, state: WorldState, object: WorldObject): ChatMessage[] {
  const loc = state.locations[object.locationId];
  const user = [
    `【世界观】${seed.worldview}`,
    `【当前地点】${loc?.name ?? object.locationId}`,
    `【物件】${object.name}`,
    `【当前状态】${object.state ?? "（未定）"}`,
    "请写这个物件被注意到时呈现出的可见状态：",
  ].join("\n");
  return [
    { role: "system", content: FLESH_OBJECT_SYSTEM },
    { role: "user", content: user },
  ];
}

export function buildFleshCharacterPrompt(seed: WorldSeed, state: WorldState, character: Character): ChatMessage[] {
  const loc = Object.values(state.locations).find((candidate) => candidate.presentCharacterIds.includes(character.id));
  const user = [
    `【世界观】${seed.worldview}`,
    `【当前地点】${loc?.name ?? state.currentLocationId}`,
    `【角色名】${character.name}`,
    `【已有要旨】${character.description || "（无）"}`,
    `【已有目标】${character.goal ?? "（未定）"}`,
    "请输出该角色的充实 JSON：",
  ].join("\n");
  return [
    { role: "system", content: FLESH_CHARACTER_SYSTEM },
    { role: "user", content: user },
  ];
}

/** Flesh out a stub location on first visit: emit one fleshLocation delta; failure/empty → null (degrade to no fleshing). */
export async function fleshStubLocation(seed: WorldSeed, loc: Location, llm: LlmFn): Promise<Delta | null> {
  try {
    const { content } = await llm(buildFleshPrompt(seed, loc));
    const description = content.trim();
    if (!description) return null;
    return { kind: "fleshLocation", locationId: loc.id, description };
  } catch {
    return null;
  }
}

/** Flesh out a visible stub object the player has paid attention to. */
export async function fleshStubObject(seed: WorldSeed, state: WorldState, object: WorldObject, llm: LlmFn): Promise<Delta | null> {
  try {
    const { content } = await llm(buildFleshObjectPrompt(seed, state, object));
    const stateText = content.trim();
    if (!stateText) return null;
    return { kind: "fleshObject", objectId: object.id, state: stateText };
  } catch {
    return null;
  }
}

function parseCharacterFlesh(content: string): { description: string; goal?: string } | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as { description?: unknown; goal?: unknown };
    const description = typeof parsed.description === "string" ? parsed.description.trim() : "";
    const goal = typeof parsed.goal === "string" ? parsed.goal.trim() : "";
    if (!description) return null;
    return { description, ...(goal ? { goal } : {}) };
  } catch {
    return { description: trimmed };
  }
}

/** Flesh out a present stub character the player has paid attention to. */
export async function fleshStubCharacter(seed: WorldSeed, state: WorldState, character: Character, llm: LlmFn): Promise<Delta | null> {
  try {
    const { content } = await llm(buildFleshCharacterPrompt(seed, state, character));
    const parsed = parseCharacterFlesh(content);
    if (!parsed) return null;
    return { kind: "fleshCharacter", characterId: character.id, description: parsed.description, goal: parsed.goal };
  } catch {
    return null;
  }
}
