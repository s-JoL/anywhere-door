import type { WorldState, Memory } from "../types";
import { keywordsOf } from "./keywords";
import { newId } from "../id";
import { nextTime } from "../clock";

export type ImportanceFn = (text: string) => number;

/** 廉价启发式 importance：动作括号/强标点/长度抬升分值；闲谈低。钳制 1–10。 */
export function defaultImportance(text: string): number {
  let s = 3;
  if (/[（(].*[)）]/.test(text)) s += 3;          // 含动作描写
  if (/[！!?？]/.test(text)) s += 1;               // 情绪标点
  if (text.length >= 30) s += 2; else if (text.length <= 4) s -= 2; // 篇幅
  return Math.max(1, Math.min(10, s));
}

/** 给单个角色构造一条观察记忆（用于 evidence→记忆等引擎内部写入）。 */
export function buildSelfMemory(charId: string, text: string, importance = 6): Memory {
  const t = nextTime();
  return { id: newId("mem"), charId, kind: "observation", text, keywords: keywordsOf(text), importance, createdAt: t, lastAccessed: t, provenance: "witnessed", confidence: 1, perceptionQuality: "full" };
}

/** 为当前场景的每个在场角色生成一条该发言的观察记忆（witness 作用域）。 */
export function buildObservations(
  state: WorldState,
  utterance: { speakerName: string; text: string },
  importanceFn: ImportanceFn = defaultImportance,
): Memory[] {
  const loc = state.locations[state.currentLocationId];
  if (!loc) return [];
  const text = `${utterance.speakerName}：${utterance.text}`;
  const keywords = keywordsOf(text);
  const importance = importanceFn(utterance.text);
  return loc.presentCharacterIds.map((charId) => {
    const t = nextTime();
    // 一手见证:满置信、完整感知(§4.5 缺省也是此语义,这里显式标注)
    return { id: newId("mem"), charId, kind: "observation" as const, text, keywords, importance, createdAt: t, lastAccessed: t, provenance: "witnessed" as const, confidence: 1, perceptionQuality: "full" as const };
  });
}
