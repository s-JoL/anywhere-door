/**
 * relationship.ts — pure functions for the social-causality ledger (CK-style affinity).
 *
 * Relationships are directed: fromId's disposition toward toId. The `affinity` is
 * anchored at a world day, and on read **decays linearly toward 0** by the number of
 * days elapsed — affinity fades, but the `evidence` (the why) stays.
 */
import type { Relationship } from "../types";

export const AFFINITY_MIN = -100;
export const AFFINITY_MAX = 100;
export const DECAY_PER_DAY = 2;  // amount affinity decays toward 0 per world day
export const EVIDENCE_CAP = 6;   // keep only the most recent few reasons

export function clampAffinity(n: number): number {
  const v = Math.max(AFFINITY_MIN, Math.min(AFFINITY_MAX, Math.round(n)));
  return v === 0 ? 0 : v; // normalize -0 → 0
}

/** Linear decay toward 0: |affinity| drops by DECAY_PER_DAY each day, not past 0. */
export function effectiveAffinity(rel: Relationship, currentDay: number): number {
  const days = Math.max(0, currentDay - rel.sinceDay);
  const faded = Math.max(0, Math.abs(rel.affinity) - DECAY_PER_DAY * days);
  return clampAffinity(Math.sign(rel.affinity) * faded);
}

/** Map the affinity number to a disposition word a character can feel (characters don't read raw numbers). */
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
 * Pure: apply one adjustment to a (possibly nonexistent) prior relationship.
 * First decay the old value to currentDay, then add affinityDelta and clamp, fold
 * reason into evidence, and re-anchor to the current day.
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
