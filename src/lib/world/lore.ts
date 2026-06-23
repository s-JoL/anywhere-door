import type { LoreEntry } from "../types";

/**
 * 世界书检索：返回任意 key 出现在 `text` 中的 lore 条目。
 * - 大小写不敏感；用纯子串匹配，对中日韩与 ASCII 都成立。
 * - 按 id 去重，按 lore 原始顺序保留，截断到 `cap`。
 * - 空 / undefined / 无匹配 → []。纯函数，不改入参。
 */
export function retrieveLore(
  text: string,
  lore: LoreEntry[] | undefined,
  cap = 4,
): LoreEntry[] {
  if (!text || !lore || lore.length === 0) return [];
  const haystack = text.toLowerCase();
  const out: LoreEntry[] = [];
  const seen = new Set<string>();
  for (const entry of lore) {
    if (!entry || seen.has(entry.id) || !Array.isArray(entry.keys)) continue;
    const hit = entry.keys.some(
      (k) => typeof k === "string" && k.length > 0 && haystack.includes(k.toLowerCase()),
    );
    if (!hit) continue;
    seen.add(entry.id);
    out.push(entry);
    if (out.length >= cap) break;
  }
  return out;
}

/** 渲染 lore 供 prompt 注入；空 → ""。 */
export function formatLore(entries: LoreEntry[]): string {
  if (!entries || entries.length === 0) return "";
  const lines = entries.map((e) => `· ${e.keys[0] ?? ""}：${e.content}`);
  return `【世界设定】\n${lines.join("\n")}`;
}
