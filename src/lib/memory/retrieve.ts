import type { Memory } from "../types";
import { relevance } from "./keywords";

/** Min-max normalize a set of values to [0,1]; returns 0.5 when all equal (consistent with Generative Agents). */
function normalize(values: number[]): number[] {
  const min = Math.min(...values), max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => (v - min) / (max - min));
}

const W_RECENCY = 0.5, W_RELEVANCE = 3, W_IMPORTANCE = 2;

/**
 * Score memories by a weighted sum (not product) of recency / relevance / importance, then take top-k.
 * recency: rank i in descending createdAt order → decay^i (newer is larger).
 * relevance: size of the intersection between query keywords and memory keywords.
 * importance: the memory's own score.
 * Each of the three is min-max normalized, then summed with weights; finally multiplied by the memory's
 * subjective confidence (§4.5, default=1), so low-confidence memories (e.g. secondhand hearsay) surface more
 * weakly. Pure function, does not mutate input.
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
    score: (W_RECENCY * recency[i] + W_RELEVANCE * relev[i] + W_IMPORTANCE * importance[i]) * (mem.confidence ?? 1),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.mem);
}
