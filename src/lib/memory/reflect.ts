import type { Memory, ChatMessage } from "../types";
import type { LlmFn } from "../engine/turn";
import { keywordsOf } from "./keywords";
import { newId } from "../id";

// ─── shouldReflect ────────────────────────────────────────────────────────────

/**
 * Pure predicate: true when there are ≥6 observation memories created AFTER
 * the most recent reflection (or ≥6 observations total if no reflection yet).
 */
export function shouldReflect(memories: Memory[]): boolean {
  const reflections = memories.filter((m) => m.kind === "reflection");
  const latestReflectionTime =
    reflections.length > 0 ? Math.max(...reflections.map((m) => m.createdAt)) : -Infinity;

  const newObsCount = memories.filter(
    (m) => m.kind === "observation" && m.createdAt > latestReflectionTime,
  ).length;

  return newObsCount >= 6;
}

// ─── parseInsights ────────────────────────────────────────────────────────────

/**
 * Extract up to 3 non-empty insight strings from LLM output.
 * Tries JSON array first; falls back to dash/middle-dot/digit-prefixed lines.
 * Any parse failure returns [].
 */
export function parseInsights(text: string): string[] {
  // Try to find a JSON array of strings anywhere in the text
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        return parsed.map((s) => s.trim()).filter(Boolean).slice(0, 3);
      }
    }
  } catch {
    // fall through to line-based fallback
  }

  // Fallback: lines starting with -, ·, or digit
  const lines = text.split("\n");
  const matched = lines
    .map((line) => {
      const m = line.match(/^[\s]*[-·\d][.、\s]*(.+)$/);
      return m ? m[1].trim() : null;
    })
    .filter((s): s is string => s !== null && s.length > 0);

  return matched.slice(0, 3);
}

// ─── buildReflectionPrompt ───────────────────────────────────────────────────

/**
 * Build the ChatMessage array to send to the LLM for reflection synthesis.
 */
export function buildReflectionPrompt(characterName: string, recent: Memory[]): ChatMessage[] {
  const systemContent =
    `你是 ${characterName}。读下面你最近亲历/听到的事，提炼出 2–3 条你此刻形成的**第一人称看法/判断/打算**` +
    `（关于他人、处境或你的下一步），每条一句话。只输出一个 JSON 字符串数组，不要多余文字。`;

  const userContent = recent.map((m) => `- ${m.text}`).join("\n");

  return [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ];
}

// ─── reflect ─────────────────────────────────────────────────────────────────

export interface ReflectArgs {
  characterName: string;
  charId: string;
  memories: Memory[];
  llm: LlmFn;
  now: number;
}

/**
 * Synthesize recent observations into reflection memories.
 * Takes the last ~15 observation memories, calls llm, parses insights.
 * Returns new Memory[] with kind:"reflection"; caller persists them.
 * Returns [] on llm error or empty insights.
 */
export async function reflect({ characterName, charId, memories, llm, now }: ReflectArgs): Promise<Memory[]> {
  // Use the last ~15 observation memories
  const observations = memories.filter((m) => m.kind === "observation");
  const recent = observations.slice(-15);

  if (recent.length === 0) return [];

  let content: string;
  try {
    const result = await llm(buildReflectionPrompt(characterName, recent));
    content = result.content;
  } catch {
    return [];
  }

  const insights = parseInsights(content);
  if (insights.length === 0) return [];

  const evidenceIds = recent.map((m) => m.id);

  return insights.map((insight, i) => {
    const t = now + i;
    return {
      id: newId("refl"),
      charId,
      kind: "reflection" as const,
      text: insight,
      keywords: keywordsOf(insight),
      importance: 7,
      evidence: evidenceIds,
      createdAt: t,
      lastAccessed: t,
      // 反思是从已有记忆推断而来,而非直接所见
      provenance: "inferred" as const,
      confidence: 0.8,
    };
  });
}
