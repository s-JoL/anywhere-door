import type { LoreEntry } from "../types";

export interface LoreRetrieveOpts {
  cap?: number;        // max entries to inject (default 4)
  maxDepth?: number;   // cascade depth: 0=direct matches only; N=an activated entry's content can trigger further entries (default 2)
  charBudget?: number; // total character budget for injected content (default unlimited)
}

/**
 * World-book retrieval: returns lore entries whose any key appears in `text`, and
 * **cascade-activates** — if a matched entry's content mentions another entry's key,
 * that entry is activated too (NovelAI/SillyTavern-style recursion), upgrading a flat
 * lookup into an "on-demand knowledge graph." Bounded by both `cap` (count) and
 * `charBudget` (characters).
 * - Case-insensitive; pure substring match, holds for CJK and ASCII alike. Deduped by
 *   id, with direct matches first in the original lore order.
 * - Third arg keeps the old usage: passing a number means `cap`. Empty / undefined /
 *   no match → []. Pure function, doesn't mutate its inputs.
 */
export function retrieveLore(
  text: string,
  lore: LoreEntry[] | undefined,
  capOrOpts: number | LoreRetrieveOpts = 4,
): LoreEntry[] {
  if (!text || !lore || lore.length === 0) return [];
  const opts: LoreRetrieveOpts = typeof capOrOpts === "number" ? { cap: capOrOpts } : capOrOpts;
  const cap = opts.cap ?? 4;
  const maxDepth = opts.maxDepth ?? 2;
  const charBudget = opts.charBudget ?? Infinity;

  const out: LoreEntry[] = [];
  const seen = new Set<string>();
  let budget = 0;
  let haystack = text.toLowerCase();

  for (let depth = 0; depth <= maxDepth; depth++) {
    const activated: LoreEntry[] = [];
    for (const entry of lore) {
      if (out.length >= cap) break;
      if (!entry || seen.has(entry.id) || !Array.isArray(entry.keys)) continue;
      const hit = entry.keys.some(
        (k) => typeof k === "string" && k.length > 0 && haystack.includes(k.toLowerCase()),
      );
      if (!hit) continue;
      const cost = entry.content?.length ?? 0;
      if (out.length > 0 && budget + cost > charBudget) continue; // over budget → skip (keep at least one)
      seen.add(entry.id);
      out.push(entry);
      activated.push(entry);
      budget += cost;
    }
    if (out.length >= cap || activated.length === 0) break;
    // Cascade: use this round's newly activated entries' content as the next haystack, triggering the other entries they mention
    haystack = activated.map((e) => (e.content ?? "").toLowerCase()).join(" ");
  }
  return out;
}

/** Render lore for prompt injection; empty → "". */
export function formatLore(entries: LoreEntry[]): string {
  if (!entries || entries.length === 0) return "";
  const lines = entries.map((e) => `· ${e.keys[0] ?? ""}：${e.content}`);
  return `【世界设定】\n${lines.join("\n")}`;
}
