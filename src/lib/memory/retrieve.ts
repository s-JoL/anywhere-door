import type { Memory } from "../types";
import { relevance } from "./keywords";

/** 把一组数值 min-max 归一到 [0,1]；全相等时返回 0.5（与 Generative Agents 一致）。 */
function normalize(values: number[]): number[] {
  const min = Math.min(...values), max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => (v - min) / (max - min));
}

const W_RECENCY = 0.5, W_RELEVANCE = 3, W_IMPORTANCE = 2;

/**
 * 按 recency / relevance / importance 三项加权求和（非乘积）给记忆打分取 top-k。
 * recency：按 createdAt 降序的名次 i → decay^i（越新越大）。
 * relevance：查询关键词与记忆关键词的交集大小。
 * importance：记忆自带分值。
 * 三项各 min-max 归一后加权求和。纯函数，不修改输入（lastAccessed 回写留待后续切片）。
 */
export function scoreMemories(
  memories: Memory[],
  queryKw: string[],
  opts: { topK?: number; decay?: number } = {},
): Memory[] {
  if (memories.length === 0) return [];
  const topK = opts.topK ?? 6;
  const decay = opts.decay ?? 0.95;

  const byRecency = [...memories].sort((a, b) => b.createdAt - a.createdAt);
  const recencyById = new Map<string, number>();
  byRecency.forEach((mem, i) => recencyById.set(mem.id, Math.pow(decay, i)));

  const recency = normalize(memories.map((m) => (recencyById.get(m.id) ?? 0)));
  const relev = normalize(memories.map((m) => relevance(queryKw, m.keywords)));
  const importance = normalize(memories.map((m) => m.importance));

  const scored = memories.map((mem, i) => ({
    mem,
    score: W_RECENCY * recency[i] + W_RELEVANCE * relev[i] + W_IMPORTANCE * importance[i],
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.mem);
}
