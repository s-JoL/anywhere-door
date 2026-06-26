/**
 * gossip.ts — gossip/reputation: word-of-mouth among co-present characters (an extension of axis 4).
 *
 * Validates the Generative Agents "Stanford town" mechanic: no dedicated propagation code is needed; information
 * spreads naturally via **witness → co-presence → retell → remember**. This module does a **cheap, deterministic, bounded**
 * version: when ≥2 NPCs share a scene, each tells everyone else present their **most salient recent firsthand observation**,
 * and the listener gains one `hearsay` (secondhand) memory from it — downweighted, deduplicated, and never retold as firsthand again.
 *
 * Pure function: given the present parties and their recent memories, returns the new hearsay memories to be written.
 */
import type { Memory } from "../types";
import { keywordsOf } from "./keywords";
import { newId } from "../id";
import { nextTime } from "../clock";

/** Strip the leading "speaker:" prefix from observation text, leaving the event itself. */
function stripObsPrefix(text: string): string {
  const i = text.indexOf("：");
  return i > 0 && i <= 8 ? text.slice(i + 1) : text;
}

export interface Gossiper { id: string; name: string }

/**
 * @param present       co-present NPCs (the player is excluded)
 * @param recentByChar  each NPC's recent memories (used to pick what to retell + deduplicate)
 */
export function propagateGossip(
  present: Gossiper[],
  recentByChar: Record<string, Memory[]>,
  opts: { instanceId: string; minImportance?: number; branchId?: string },
): Memory[] {
  if (present.length < 2) return [];
  const minImportance = opts?.minImportance ?? 6;
  const out: Memory[] = [];
  for (const teller of present) {
    // Retell only the most salient single **firsthand observation** (hearsay/reflection is not retold further, to avoid infinite nesting)
    const firsthand = (recentByChar[teller.id] ?? []).filter((m) => (
      m.kind === "observation" &&
      (m.provenance ?? "witnessed") === "witnessed" &&
      (m.perceptionQuality ?? "full") === "full"
    ));
    if (!firsthand.length) continue;
    const top = firsthand.reduce((a, b) => (b.importance > a.importance ? b : a));
    if (top.importance < minImportance) continue;
    const gist = stripObsPrefix(top.text);
    const text = `听${teller.name}提起：${gist}`;
    for (const listener of present) {
      if (listener.id === teller.id) continue;
      const known = recentByChar[listener.id] ?? [];
      if (known.some((m) => m.text === text)) continue; // already heard, don't repeat
      const t = nextTime();
      // Secondhand retelling: provenance=heard, confidence discounted further from the teller's own confidence (< firsthand), perception quality partial
      const tellerConfidence = top.confidence ?? 1;
      const memory: Memory = {
        id: newId("mem"),
        instanceId: opts.instanceId,
        charId: listener.id,
        kind: "hearsay",
        text,
        keywords: keywordsOf(text),
        importance: Math.max(1, Math.round(top.importance * 0.6)),
        createdAt: t,
        lastAccessed: t,
        provenance: "heard",
        confidence: Math.round(tellerConfidence * 0.6 * 100) / 100,
        perceptionQuality: "partial",
      };
      if (opts?.branchId) memory.branchId = opts.branchId;
      out.push(memory);
    }
  }
  return out;
}
