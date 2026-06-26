import type { WorldState, Memory } from "../types";
import type { Delta } from "../world/delta";
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
export function buildSelfMemory(instanceId: string, charId: string, text: string, importance = 6, branchId?: string): Memory {
  const t = nextTime();
  const memory: Memory = { id: newId("mem"), instanceId, charId, kind: "observation", text, keywords: keywordsOf(text), importance, createdAt: t, lastAccessed: t, provenance: "witnessed", confidence: 1, perceptionQuality: "full" };
  if (branchId) memory.branchId = branchId;
  return memory;
}

/** Generate one observation memory of this utterance for each character present in the current scene (witness scope). */
export function buildObservations(
  instanceId: string,
  state: WorldState,
  utterance: { speakerName: string; text: string },
  importanceFn: ImportanceFn = defaultImportance,
  branchId?: string,
): Memory[] {
  const loc = state.locations[state.currentLocationId];
  if (!loc) return [];
  const text = `${utterance.speakerName}：${utterance.text}`;
  const keywords = keywordsOf(text);
  const importance = importanceFn(utterance.text);
  return loc.presentCharacterIds.map((charId) => {
    const t = nextTime();
    // Firsthand witness: full confidence, full perception (§4.5's default is also this semantics; made explicit here)
    const memory: Memory = { id: newId("mem"), instanceId, charId, kind: "observation", text, keywords, importance, createdAt: t, lastAccessed: t, provenance: "witnessed", confidence: 1, perceptionQuality: "full" };
    if (branchId) memory.branchId = branchId;
    return memory;
  });
}

function entityName(state: WorldState, entityId: string | undefined): string {
  if (!entityId) return "世界";
  return state.objects[entityId]?.name ?? state.locations[entityId]?.name ?? state.roster[entityId]?.name ?? state.characters?.[entityId]?.name ?? entityId;
}

interface ConsequenceLine {
  full: string;
  partial?: string;
  concealment?: boolean;
}

export interface ConsequenceObservationOptions {
  /** Characters who directly perceived exact concealment details. Everyone else receives only partial/inferred awareness. */
  exactWitnessIds?: readonly string[];
}

function isHiddenFact(delta: Delta): delta is Extract<Delta, { kind: "setFact" }> {
  return delta.kind === "setFact" && delta.field === "hidden";
}

function consequenceLine(state: WorldState, delta: Delta, concealedEntityIds: Set<string>): ConsequenceLine | null {
  switch (delta.kind) {
    case "setFact": {
      const subject = entityName(state, delta.entityId);
      const value = delta.value.trim();
      if (delta.field === "hidden") return { full: `${subject}藏在${value}`, partial: `${subject}被你遮掩起来`, concealment: true };
      if (delta.field === "location") return { full: `${subject}在${value}` };
      if (delta.field === "promise") return { full: `${subject}承诺${value}` };
      if (delta.field === "state") return { full: `${subject}：${value}` };
      return { full: delta.entityId ? `${subject}的${delta.field}：${value}` : `${delta.field}：${value}` };
    }
    case "setObjectState":
      if (concealedEntityIds.has(delta.objectId)) {
        return { full: `${entityName(state, delta.objectId)}变成${delta.state}`, partial: `${entityName(state, delta.objectId)}被你遮掩起来`, concealment: true };
      }
      return { full: `${entityName(state, delta.objectId)}变成${delta.state}` };
    case "setObjectLocked":
      return { full: `${entityName(state, delta.objectId)}${delta.locked ? "被锁上" : "被打开"}` };
    case "moveObject":
      if (concealedEntityIds.has(delta.objectId)) {
        return { full: `${entityName(state, delta.objectId)}被移到${entityName(state, delta.toLocationId)}`, partial: `${entityName(state, delta.objectId)}被你移开并遮掩起来`, concealment: true };
      }
      return { full: `${entityName(state, delta.objectId)}被移到${entityName(state, delta.toLocationId)}` };
    case "setCondition":
      return { full: `${entityName(state, delta.entityId)}此刻${delta.condition}` };
    default:
      return null;
  }
}

/**
 * Persisted consequences become witness-scoped memories. This bridges objective
 * truth back into subjective history without teaching absent characters.
 */
export function buildConsequenceObservations(
  instanceId: string,
  witnessState: WorldState,
  deltas: Delta[],
  cause: string,
  branchId?: string,
  renderState: WorldState = witnessState,
  options: ConsequenceObservationOptions = {},
): Memory[] {
  const loc = witnessState.locations[witnessState.currentLocationId];
  if (!loc) return [];
  const concealedEntityIds = new Set(deltas.filter(isHiddenFact).map((delta) => delta.entityId).filter((id): id is string => !!id));
  const lines = deltas.map((delta) => consequenceLine(renderState, delta, concealedEntityIds)).filter((line): line is ConsequenceLine => !!line);
  if (lines.length === 0) return [];

  const exactWitnessIds = new Set(options.exactWitnessIds ?? []);
  const out: Memory[] = [];

  for (const charId of loc.presentCharacterIds) {
    const fullLines = lines.filter((line) => !line.concealment || exactWitnessIds.has(charId)).map((line) => line.full);
    const partialLines = lines.filter((line) => line.concealment && !exactWitnessIds.has(charId) && line.partial).map((line) => line.partial!);

    if (fullLines.length > 0) {
      const text = `你造成的后果：${fullLines.join("；")}。`;
      const t = nextTime();
      const memory: Memory = {
        id: newId("mem"),
        instanceId,
        charId,
        kind: "observation",
        text,
        keywords: keywordsOf(`${cause}\n${text}`),
        importance: 7,
        createdAt: t,
        lastAccessed: t,
        provenance: "witnessed",
        confidence: 1,
        perceptionQuality: "full",
      };
      if (branchId) memory.branchId = branchId;
      out.push(memory);
    }

    if (partialLines.length > 0) {
      const uniquePartialLines = Array.from(new Set(partialLines));
      const text = `你造成的后果：${uniquePartialLines.join("；")}。`;
      const t = nextTime();
      const memory: Memory = {
        id: newId("mem"),
        instanceId,
        charId,
        kind: "observation",
        text,
        keywords: keywordsOf(text),
        importance: 5,
        createdAt: t,
        lastAccessed: t,
        provenance: "inferred",
        confidence: 0.35,
        perceptionQuality: "partial",
      };
      if (branchId) memory.branchId = branchId;
      out.push(memory);
    }
  }

  return out;
}
