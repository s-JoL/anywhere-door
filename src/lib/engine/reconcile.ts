import type { Fact, Memory, WorldState } from "../types";
import type { Delta } from "../world/delta";
import { keywordsOf } from "../memory/keywords";
import { newId } from "../id";
import { nextTime } from "../clock";

export interface GodEditReconcileArgs {
  before: WorldState;
  committed: Delta[];
  memories: Memory[];
  now?: () => number;
  branchId?: string;
}

function sameFactSlot(a: Fact, d: Extract<Delta, { kind: "setFact" }>): boolean {
  return a.entityId === d.entityId && a.field === d.field;
}

function normalizeEvidenceText(text: string): string {
  return text.trim().replace(/\s+/g, "");
}

const OLD_VALUE_EVIDENCE_CLUSTERS: Array<{ triggers: string[]; evidence: string[] }> = [
  { triggers: ["受伤", "负伤", "伤口"], evidence: ["受伤", "负伤", "伤口", "绷带", "包扎", "流血", "避痛", "疼"] },
  { triggers: ["完好", "无伤", "健康", "康复"], evidence: ["完好", "无伤", "没受伤", "健康", "康复", "没事"] },
  { triggers: ["信任", "相信"], evidence: ["信任", "相信", "自己人", "交给", "托付", "放心", "靠得住", "站在你这边"] },
  { triggers: ["戒备", "怀疑", "不信任"], evidence: ["戒备", "怀疑", "不信任", "提防", "防着", "保持距离", "不肯相信"] },
  { triggers: ["记恨", "怨恨"], evidence: ["记恨", "怨恨", "怨你", "恨你", "怀恨"] },
];

function semanticOldValueEvidence(oldValue: string, memoryText: string): boolean {
  const value = normalizeEvidenceText(oldValue);
  if (!value) return false;
  for (const cluster of OLD_VALUE_EVIDENCE_CLUSTERS) {
    if (!cluster.triggers.some((trigger) => value.includes(trigger))) continue;
    if (cluster.evidence.some((evidence) => memoryText.includes(normalizeEvidenceText(evidence)))) return true;
  }
  return false;
}

function referencesOldValue(oldValue: string, memory: Memory, subjectHints: string[] = []): boolean {
  const text = normalizeEvidenceText(memory.text);
  const value = normalizeEvidenceText(oldValue);
  if (!value) return false;
  const hints = subjectHints.map((hint) => hint.trim().replace(/\s+/g, "")).filter(Boolean);
  const hasSubject = hints.length === 0 || hints.some((hint) => text.includes(hint));
  if (!hasSubject) return false;
  if (text.includes(value)) return true;
  return hints.length > 0 && semanticOldValueEvidence(oldValue, text);
}

interface ReconcileTarget {
  subject: string;
  oldValue: string;
  nextValue: string;
  subjectHints?: string[];
}

function conditionTarget(before: WorldState, delta: Extract<Delta, { kind: "setCondition" }>): ReconcileTarget | null {
  const oldValue = before.roster[delta.entityId]?.condition;
  if (!oldValue || oldValue === delta.condition) return null;
  const name = before.roster[delta.entityId]?.name ?? delta.entityId;
  return {
    subject: `${name} 的状态`,
    oldValue,
    nextValue: delta.condition,
    subjectHints: [name, delta.entityId],
  };
}

function relationshipTarget(before: WorldState, delta: Extract<Delta, { kind: "setRelationship" }>): ReconcileTarget | null {
  const oldRelationship = before.relationships?.[delta.fromId]?.[delta.toId];
  const oldValue = oldRelationship?.disposition ?? oldRelationship?.evidence[oldRelationship.evidence.length - 1];
  const nextValue = delta.disposition ?? delta.reason;
  if (!oldValue || !nextValue || oldValue === nextValue) return null;
  const fromName = before.roster[delta.fromId]?.name ?? delta.fromId;
  const toName = before.roster[delta.toId]?.name ?? delta.toId;
  return {
    subject: `${fromName} 对 ${toName} 的态度`,
    oldValue,
    nextValue,
    subjectHints: [fromName, delta.fromId],
  };
}

function targetForDelta(before: WorldState, delta: Delta): ReconcileTarget | null {
  if (delta.kind === "setFact") {
    const oldFact = (before.facts ?? []).find((fact) => sameFactSlot(fact, delta));
    if (!oldFact || oldFact.value === delta.value) return null;
    const subject = oldFact.entityId ? `${oldFact.entityId} 的 ${oldFact.field}` : oldFact.field;
    const entityName =
      oldFact.entityId ? (before.roster[oldFact.entityId]?.name ?? before.objects[oldFact.entityId]?.name) : undefined;
    return {
      subject,
      oldValue: oldFact.value,
      nextValue: delta.value,
      subjectHints: oldFact.entityId ? [entityName ?? "", oldFact.entityId] : [],
    };
  }
  if (delta.kind === "setCondition") return conditionTarget(before, delta);
  if (delta.kind === "setRelationship") return relationshipTarget(before, delta);
  return null;
}

function correctionText(target: ReconcileTarget): string {
  return `关于${target.subject}，我后来意识到自己曾把「${target.oldValue}」当成了真相；现在更可靠的事实是「${target.nextValue}」。`;
}

export function reconcileGodEditMemories({ before, committed, memories, now = nextTime, branchId }: GodEditReconcileArgs): Memory[] {
  const out: Memory[] = [];
  for (const delta of committed) {
    const target = targetForDelta(before, delta);
    if (!target) continue;

    const byChar = new Map<string, Memory[]>();
    for (const memory of memories) {
      if (!referencesOldValue(target.oldValue, memory, target.subjectHints)) continue;
      byChar.set(memory.charId, [...(byChar.get(memory.charId) ?? []), memory]);
    }

    for (const [charId, evidence] of byChar) {
      const text = correctionText(target);
      const at = now();
      const memory: Memory = {
        id: newId("mem"),
        instanceId: evidence[0].instanceId,
        charId,
        kind: "reflection",
        text,
        keywords: keywordsOf(text),
        importance: 9,
        createdAt: at,
        lastAccessed: at,
        evidence: evidence.map((m) => m.id),
        provenance: "authored",
        confidence: 1,
        perceptionQuality: "full",
        interpretation: "旧判断已经不可靠，应按后来确认的事实行动。",
      };
      if (branchId) memory.branchId = branchId;
      out.push(memory);
    }
  }
  return out;
}
