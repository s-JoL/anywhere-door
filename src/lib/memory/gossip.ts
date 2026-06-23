/**
 * gossip.ts — 传话/声誉:同场角色之间的口耳相传(轴4 的延伸)。
 *
 * 印证 Generative Agents「斯坦福小镇」机制:无需专门的传播代码,信息靠
 * **见证 → 同场 → 转述 → 记住** 自然扩散。本模块做一个**廉价、确定性、有界**的版本:
 * 当 ≥2 个 NPC 同处一场景,每人把自己**最显著的近期一手观察**说给在场其他人,
 * 对方据此获得一条 `hearsay`(二手)记忆——降权、去重、不会再被当一手转述出去。
 *
 * 纯函数:给定在场者与各自近期记忆,返回需要写入的新 hearsay 记忆。
 */
import type { Memory } from "../types";
import { keywordsOf } from "./keywords";
import { newId } from "../id";
import { nextTime } from "../clock";

/** 去掉观察文本开头的「发言者：」前缀,留事件本身。 */
function stripObsPrefix(text: string): string {
  const i = text.indexOf("：");
  return i > 0 && i <= 8 ? text.slice(i + 1) : text;
}

export interface Gossiper { id: string; name: string }

/**
 * @param present       同场 NPC(玩家排除在外)
 * @param recentByChar  每个 NPC 的近期记忆(用于挑可传的事 + 去重)
 */
export function propagateGossip(
  present: Gossiper[],
  recentByChar: Record<string, Memory[]>,
  opts?: { minImportance?: number },
): Memory[] {
  if (present.length < 2) return [];
  const minImportance = opts?.minImportance ?? 6;
  const out: Memory[] = [];
  for (const teller of present) {
    // 只转述**一手观察**里最显著的一条(hearsay/reflection 不再外传,避免无限套娃)
    const firsthand = (recentByChar[teller.id] ?? []).filter((m) => m.kind === "observation");
    if (!firsthand.length) continue;
    const top = firsthand.reduce((a, b) => (b.importance > a.importance ? b : a));
    if (top.importance < minImportance) continue;
    const gist = stripObsPrefix(top.text);
    const text = `听${teller.name}提起：${gist}`;
    for (const listener of present) {
      if (listener.id === teller.id) continue;
      const known = recentByChar[listener.id] ?? [];
      if (known.some((m) => m.text === text)) continue; // 已经听过,不重复
      const t = nextTime();
      out.push({
        id: newId("mem"),
        charId: listener.id,
        kind: "hearsay",
        text,
        keywords: keywordsOf(text),
        importance: Math.max(1, Math.round(top.importance * 0.6)),
        createdAt: t,
        lastAccessed: t,
      });
    }
  }
  return out;
}
