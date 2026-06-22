import type { WorldState, Message, ChatMessage } from "../types";
import type { LlmFn } from "./turn";
import { newId } from "../id";
import { nextTime } from "../clock";

/** 纯：根据最近一句更新张力（冲突/动作/强标点升，平淡衰减），钳 0–10。 */
export function updateTension(prev: number, lastLine: string): number {
  let t = prev;
  if (/[（(].*[)）]/.test(lastLine)) t += 1.5;          // 有动作
  if (/[！!?？]/.test(lastLine)) t += 1;                 // 情绪
  if (/枪|血|死|逃|打|抓|吼|威胁|危险|喊/.test(lastLine)) t += 2; // 冲突词
  if (lastLine.length <= 6) t -= 1;                      // 短促闲谈
  t -= 0.5;                                              // 自然衰减
  return Math.max(0, Math.min(10, t));
}

const DIRECTOR_SYSTEM =
  "你是世界环境导演。只用一句简短的第三人称中文旁白，描述此刻**外部可见**的环境/气氛微变化（光线、声音、天气、人群、物件），" +
  "推进临场感但不剧透任何人内心、不替角色说话、不下判断。只输出这一句旁白本身，不要引号、不要任何多余文字。";

export interface NarrateArgs { state: WorldState; recentLines: string[]; llm: LlmFn }

/** 产一句世界旁白；失败/空 → null（降级不插旁白）。 */
export async function directorNarrate({ state, recentLines, llm }: NarrateArgs): Promise<string | null> {
  const user =
    `【场景】${state.locations[state.currentLocationId]?.name ?? ""}（${state.time.clock}，${state.time.lighting}）\n` +
    `【最近】\n${recentLines.slice(-6).join("\n") || "（暂无）"}`;
  try {
    const { content } = await llm([{ role: "system", content: DIRECTOR_SYSTEM }, { role: "user", content: user }]);
    const line = content.trim();
    return line.length > 0 ? line : null;
  } catch {
    return null;
  }
}

export interface MaybeDirectArgs {
  instanceId: string;
  state: WorldState;
  recentLines: string[];
  tensionBefore: number;
  tensionAfter: number;
  llm: LlmFn;
}

/** 节拍决策：张力明显上升、或攒到较高时，插一条世界旁白。返回旁白 Message 或 null。 */
export async function maybeDirect(args: MaybeDirectArgs): Promise<Message | null> {
  const { instanceId, state, recentLines, tensionBefore, tensionAfter, llm } = args;
  const rose = tensionAfter - tensionBefore >= 1.5;
  const high = tensionAfter >= 6;
  if (!rose && !high) return null;
  const line = await directorNarrate({ state, recentLines, llm });
  if (!line) return null;
  return { id: newId("n"), instanceId, role: "system", speakerId: null, content: line, narration: true, createdAt: nextTime() };
}
