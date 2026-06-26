import type { WorldSeed, WorldState, Character, Memory, ChatMessage } from "../types";
import type { Intent } from "./select";
import type { LlmFn } from "./turn";
import { buildCharacterPrompt } from "./prompt";
import { effectiveAffinity } from "../world/relationship";
import { scoreMemories } from "../memory/retrieve";
import { keywordsOf, relevance } from "../memory/keywords";

/**
 * Social causality → speak intent: a character's strongest feeling toward an **onstage**
 * target (|affinity|, love or hate alike) converts into a 0..weight eagerness boost —
 * the deeper the emotional involvement, the more they want to speak / the likelier to break a lull.
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
const MEMORY_EAGERNESS_WEIGHT = 0.08;
const MEMORY_EAGERNESS_CAP = 0.35;
const SOCIAL_PRESSURE_SPEAK_THRESHOLD = 0.65;
const RELATIONSHIP_PRESSURE_MIN = 0.25;
const RELEVANT_MEMORY_PRESSURE_MIN = 0.08;

/** Extract the first {...} from the text and parse an intent; any error falls back to a safe pass; eagerness clamped to [0,1]. */
export function parseIntent(text: string): Intent {
  const m = text.match(/\{[^{}]*\}/);
  if (!m) return SAFE_PASS;
  try {
    const o = JSON.parse(m[0]);
    if (o.action !== "speak" && o.action !== "pass" && o.action !== "avoid") return SAFE_PASS;
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
  /** Recent observation history (witness-scoped, the range this character can perceive). */
  recent?: Memory[];
  /** The character's own subjective memory store; never pass omniscient or other-character memories here. */
  ownMemories?: Memory[];
  /** Current player/world stimulus used to retrieve relevant subjective memories for intent. */
  query?: string;
  llm: LlmFn;
}

function memoryEagernessBoost(memories: Memory[] | undefined, query: string | undefined): number {
  if (!memories || memories.length === 0) return 0;
  const queryKw = keywordsOf(query ?? "");
  if (queryKw.length === 0) return 0;
  let strongest = 0;
  for (const memory of memories) {
    const overlap = relevance(queryKw, memory.keywords.length > 0 ? memory.keywords : keywordsOf(memory.text));
    if (overlap <= 0) continue;
    const confidence = memory.confidence ?? 1;
    strongest = Math.max(strongest, overlap * (memory.importance / 10) * confidence);
  }
  return Math.min(MEMORY_EAGERNESS_CAP, strongest * MEMORY_EAGERNESS_WEIGHT);
}

const JUDGE_TAIL =
  "【系统指令·暂停扮演】现在不要输出任何台词或旁白，只判断：以你的身份，此刻你想不想开口插话/接话？" +
  '严格只输出一行 JSON：{"action":"speak"或"pass"或"avoid","eagerness":0到1的小数}。speak=现在就想说；pass=这轮先不说；avoid=明显回避、冷处理、避开对方但不说话。';

/** Have a character judge whether they want to speak now. Shares the subjective prefix with speaking, only the final turn is swapped for the judge instruction. Fails to a safe pass. */
export async function decideIntent(args: DecideIntentArgs): Promise<Intent> {
  const { seed, state, character, ownMemories, query, llm } = args;
  const recent = args.recent ?? ownMemories?.slice(-8) ?? [];
  const memories = ownMemories ? scoreMemories(ownMemories, keywordsOf(query ?? ""), { topK: 6 }) : undefined;
  try {
    const msgs: ChatMessage[] = buildCharacterPrompt(seed, state, character, { memories, recent });
    msgs.push({ role: "user", content: JUDGE_TAIL });
    const { content } = await llm(msgs);
    const intent = parseIntent(content);
    // Social causality: the deeper the emotional involvement with an onstage target, the higher the eagerness (affects speaker selection + breaking a lull)
    const boost = affinityEagernessBoost(state, character.id);
    const memoryBoost = memoryEagernessBoost(ownMemories, query);
    const eagerness = Math.min(1, intent.eagerness + boost + memoryBoost);
    const shouldPushBack =
      intent.action === "pass" &&
      boost >= RELATIONSHIP_PRESSURE_MIN &&
      memoryBoost >= RELEVANT_MEMORY_PRESSURE_MIN &&
      eagerness >= SOCIAL_PRESSURE_SPEAK_THRESHOLD;
    return { action: shouldPushBack ? "speak" : intent.action, eagerness };
  } catch {
    return SAFE_PASS;
  }
}
