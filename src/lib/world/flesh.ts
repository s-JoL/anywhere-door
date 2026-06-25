/**
 * flesh.ts — stub→fleshed lazy fleshing (axis 2: grow on demand).
 *
 * When the player first steps into a `detail:"stub"` location, the world **fleshes
 * it out on the spot** into a richer in-scene description and crystallizes it to
 * `fleshed`. Engine-triggered (not a reactor proposal), still goes through the
 * fleshLocation delta.
 */
import type { WorldSeed, Location, ChatMessage } from "../types";
import type { Delta } from "./delta";
import type { LlmFn } from "@/lib/engine/turn";

const FLESH_SYSTEM =
  "你是世界环境作家。给定世界观与一处地点的名称、一句话要旨，写出 1–2 句此刻踏入者**外部可见**的临场环境描述" +
  "（光线/声音/气味/陈设/天气这类），贴合世界观、与要旨一致。不要引入有名字的新角色或新物体，不要写任何人的内心，" +
  "不要替玩家叙述其动作。只输出这段描述本身，不要引号、不要多余文字。";

export function buildFleshPrompt(seed: WorldSeed, loc: Location): ChatMessage[] {
  const user = `【世界观】${seed.worldview}\n【地点】${loc.name}\n【要旨】${loc.gist || "（无）"}\n\n请写这处地点此刻的临场描述：`;
  return [
    { role: "system", content: FLESH_SYSTEM },
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
