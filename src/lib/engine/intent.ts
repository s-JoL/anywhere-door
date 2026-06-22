import type { WorldSeed, WorldState, Character, Memory, ChatMessage } from "../types";
import type { Intent } from "./select";
import type { LlmFn } from "./turn";
import { buildCharacterPrompt } from "./prompt";

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
    return parseIntent(content);
  } catch {
    return SAFE_PASS;
  }
}
