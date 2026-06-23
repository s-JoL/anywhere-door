import type { WorldSeed, WorldState, Character, Memory, ChatMessage } from "../types";
import type { Intent } from "./select";
import type { LlmFn } from "./turn";
import { buildCharacterPrompt } from "./prompt";
import { effectiveAffinity } from "../world/relationship";

/**
 * 社会因果→发言意图:角色对**在场**对象最强烈的感受(|好感|,爱或恨皆然)转成一个
 * 0..weight 的急切度加成——情绪卷入越深越想开口/越可能在冷场时打破沉默。
 */
export function affinityEagernessBoost(state: WorldState, characterId: string, weight = 0.4): number {
  const rels = state.relationships?.[characterId];
  if (!rels) return 0;
  const loc = state.locations[state.currentLocationId];
  const present = new Set([...(loc?.presentCharacterIds ?? []), "you"]);
  let strongest = 0;
  for (const [toId, rel] of Object.entries(rels)) {
    if (!present.has(toId)) continue;
    const a = Math.abs(effectiveAffinity(rel, state.time.day));
    if (a > strongest) strongest = a;
  }
  return (strongest / 100) * weight;
}

const SAFE_PASS: Intent = { action: "pass", eagerness: 0 };

/** 从文本里抽第一个 {...} 解析意图；任何异常回退安全 pass；eagerness 钳到 [0,1]。 */
export function parseIntent(text: string): Intent {
  const m = text.match(/\{[^{}]*\}/);
  if (!m) return SAFE_PASS;
  try {
    const o = JSON.parse(m[0]);
    if (o.action !== "speak" && o.action !== "pass") return SAFE_PASS;
    const e = typeof o.eagerness === "number" ? o.eagerness : 0;
    return { action: o.action, eagerness: Math.max(0, Math.min(1, e)) };
  } catch {
    return SAFE_PASS;
  }
}

export interface DecideIntentArgs {
  seed: WorldSeed;
  state: WorldState;
  character: Character;
  recent: Memory[];   // 近段观察历史（witness 作用域，该角色能感知的范围）
  llm: LlmFn;
}

const JUDGE_TAIL =
  "【系统指令·暂停扮演】现在不要输出任何台词或旁白，只判断：以你的身份，此刻你想不想开口插话/接话？" +
  '严格只输出一行 JSON：{"action":"speak"或"pass","eagerness":0到1的小数}。speak=现在就想说；pass=这轮先不说。';

/** 让某角色判断现在想不想发言。与发言共享主观前缀，仅末轮换成判断指令。失败安全 pass。 */
export async function decideIntent(args: DecideIntentArgs): Promise<Intent> {
  const { seed, state, character, recent, llm } = args;
  try {
    const msgs: ChatMessage[] = buildCharacterPrompt(seed, state, character, { recent });
    msgs.push({ role: "user", content: JUDGE_TAIL });
    const { content } = await llm(msgs);
    const intent = parseIntent(content);
    // 社会因果:对在场对象情绪卷入越深,急切度越高(影响选发言者 + 冷场破冰)
    const boost = affinityEagernessBoost(state, character.id);
    return { action: intent.action, eagerness: Math.min(1, intent.eagerness + boost) };
  } catch {
    return SAFE_PASS;
  }
}
