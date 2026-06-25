import type { WorldState, Memory } from "../types";
import { keywordsOf } from "./keywords";
import { newId } from "../id";
import { nextTime } from "../clock";

export type ImportanceFn = (text: string) => number;

/** Cheap heuristic importance: action parens / strong punctuation / length raise the score; small talk is low. Clamped 1–10. */
export function defaultImportance(text: string): number {
  let s = 3;
  if (/[（(].*[)）]/.test(text)) s += 3;          // contains action description
  if (/[！!?？]/.test(text)) s += 1;               // emotional punctuation
  if (text.length >= 30) s += 2; else if (text.length <= 4) s -= 2; // length
  return Math.max(1, Math.min(10, s));
}

/** Construct a single observation memory for one character (for engine-internal writes such as evidence→memory). */
export function buildSelfMemory(charId: string, text: string, importance = 6): Memory {
  const t = nextTime();
  return { id: newId("mem"), charId, kind: "observation", text, keywords: keywordsOf(text), importance, createdAt: t, lastAccessed: t, provenance: "witnessed", confidence: 1, perceptionQuality: "full" };
}

/** Generate one observation memory of this utterance for each character present in the current scene (witness scope). */
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
    // Firsthand witness: full confidence, full perception (§4.5's default is also this semantics; made explicit here)
    return { id: newId("mem"), charId, kind: "observation" as const, text, keywords, importance, createdAt: t, lastAccessed: t, provenance: "witnessed" as const, confidence: 1, perceptionQuality: "full" as const };
  });
}
