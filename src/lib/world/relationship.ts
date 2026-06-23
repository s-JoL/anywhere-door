/**
 * relationship.ts — 社会因果账本(CK 式好感)的纯函数。
 *
 * 关系是有向的:fromId 对 toId 的态度。好感 `affinity` 锚定在某个世界日,
 * 读取时按经过的天数**朝 0 线性衰减**——好感会淡,但 `evidence`(凭什么)留着。
 */
import type { Relationship } from "../types";

export const AFFINITY_MIN = -100;
export const AFFINITY_MAX = 100;
export const DECAY_PER_DAY = 2;  // 好感每过一个世界日朝 0 衰减的量
export const EVIDENCE_CAP = 6;   // 只保留最近的若干条理由

export function clampAffinity(n: number): number {
  const v = Math.max(AFFINITY_MIN, Math.min(AFFINITY_MAX, Math.round(n)));
  return v === 0 ? 0 : v; // 归一 -0 → 0
}

/** 朝 0 线性衰减:|affinity| 每天减 DECAY_PER_DAY,不过 0。 */
export function effectiveAffinity(rel: Relationship, currentDay: number): number {
  const days = Math.max(0, currentDay - rel.sinceDay);
  const faded = Math.max(0, Math.abs(rel.affinity) - DECAY_PER_DAY * days);
  return clampAffinity(Math.sign(rel.affinity) * faded);
}

/** 把好感数值映射成角色能体会的态度词(角色不读裸数字)。 */
export function affinityBand(affinity: number): string {
  if (affinity >= 60) return "信任/亲近";
  if (affinity >= 25) return "友善";
  if (affinity > -25) return "中立";
  if (affinity > -60) return "戒备";
  return "敌意/记恨";
}

export interface RelationshipUpdate {
  affinityDelta?: number;
  reason?: string;
  disposition?: string;
}

/**
 * 纯:对(可能不存在的)旧关系应用一次调整。
 * 先把旧值衰减到 currentDay,再叠加 affinityDelta、钳位,把 reason 计入证据,重新锚定当天。
 */
export function applyRelationshipUpdate(
  prev: Relationship | undefined,
  upd: RelationshipUpdate,
  currentDay: number,
): Relationship {
  const base = prev ? effectiveAffinity(prev, currentDay) : 0;
  const affinity = clampAffinity(base + (upd.affinityDelta ?? 0));
  const reason = upd.reason?.trim();
  const evidence = reason
    ? [...(prev?.evidence ?? []), reason].slice(-EVIDENCE_CAP)
    : (prev?.evidence ?? []);
  const disposition = upd.disposition?.trim() || prev?.disposition;
  return { affinity, disposition, evidence, sinceDay: currentDay };
}
