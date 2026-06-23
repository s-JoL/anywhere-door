import type { LoreEntry } from "../types";

export interface LoreRetrieveOpts {
  cap?: number;        // 最多注入多少条(默认 4)
  maxDepth?: number;   // 级联深度:0=仅直接匹配;N=被激活条目的 content 再触发其它条目(默认 2)
  charBudget?: number; // 注入正文总字数预算(默认无限)
}

/**
 * 世界书检索：返回任意 key 出现在 `text` 中的 lore 条目,并**级联激活**——一个被命中条目的
 * 正文里再提到别的条目的 key,那个条目也会被激活(NovelAI/SillyTavern 式 recursion),
 * 把平面查表升级成"按需展开的知识图谱"。受 `cap`(条数)与 `charBudget`(字数)双重约束。
 * - 大小写不敏感；纯子串匹配,对中日韩与 ASCII 都成立。按 id 去重,直接匹配按 lore 原始顺序在前。
 * - 第三参数兼容旧用法:传 number 即 `cap`。空 / undefined / 无匹配 → []。纯函数,不改入参。
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
      if (out.length > 0 && budget + cost > charBudget) continue; // 超预算则跳过(至少保留一条)
      seen.add(entry.id);
      out.push(entry);
      activated.push(entry);
      budget += cost;
    }
    if (out.length >= cap || activated.length === 0) break;
    // 级联:用本轮新激活条目的正文作下一轮 haystack,触发它们提到的其它条目
    haystack = activated.map((e) => (e.content ?? "").toLowerCase()).join(" ");
  }
  return out;
}

/** 渲染 lore 供 prompt 注入；空 → ""。 */
export function formatLore(entries: LoreEntry[]): string {
  if (!entries || entries.length === 0) return "";
  const lines = entries.map((e) => `· ${e.keys[0] ?? ""}：${e.content}`);
  return `【世界设定】\n${lines.join("\n")}`;
}
