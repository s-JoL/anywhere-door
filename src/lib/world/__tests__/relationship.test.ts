import { describe, it, expect } from "vitest";
import {
  effectiveAffinity,
  affinityBand,
  applyRelationshipUpdate,
  EVIDENCE_CAP,
} from "../relationship";
import type { Relationship } from "../../types";

function rel(partial: Partial<Relationship>): Relationship {
  return { affinity: 0, evidence: [], sinceDay: 0, ...partial };
}

describe("effectiveAffinity (linear decay toward 0)", () => {
  it("returns the stored affinity on the same day", () => {
    expect(effectiveAffinity(rel({ affinity: 40, sinceDay: 3 }), 3)).toBe(40);
  });
  it("decays toward zero as in-world days pass", () => {
    // 40, decays 2 per day → 30 after 5 days
    expect(effectiveAffinity(rel({ affinity: 40, sinceDay: 0 }), 5)).toBe(30);
  });
  it("never crosses zero (positive)", () => {
    expect(effectiveAffinity(rel({ affinity: 6, sinceDay: 0 }), 100)).toBe(0);
  });
  it("decays negative affinity toward zero too", () => {
    expect(effectiveAffinity(rel({ affinity: -40, sinceDay: 0 }), 5)).toBe(-30);
    expect(effectiveAffinity(rel({ affinity: -6, sinceDay: 0 }), 100)).toBe(0);
  });
});

describe("affinityBand", () => {
  it("maps numbers to character-readable attitude words", () => {
    expect(affinityBand(80)).toContain("信任");
    expect(affinityBand(0)).toBe("中立");
    expect(affinityBand(-80)).toMatch(/敌意|记恨/);
  });
});

describe("applyRelationshipUpdate", () => {
  it("creates a fresh structured relationship from nothing", () => {
    const r = applyRelationshipUpdate(undefined, { affinityDelta: -15, reason: "拿走了我的剑", disposition: "记恨" }, 2);
    expect(r).toEqual({ affinity: -15, disposition: "记恨", evidence: ["拿走了我的剑"], sinceDay: 2 });
  });
  it("decays the prior value before applying the new delta, then re-anchors the day", () => {
    const prev = rel({ affinity: 40, sinceDay: 0, evidence: ["替我挡了一刀"] });
    // day 5 → prev decays 40→30, then +20 → 50
    const r = applyRelationshipUpdate(prev, { affinityDelta: 20, reason: "又帮了我" }, 5);
    expect(r.affinity).toBe(50);
    expect(r.sinceDay).toBe(5);
    expect(r.evidence).toEqual(["替我挡了一刀", "又帮了我"]);
  });
  it("clamps affinity to [-100, 100]", () => {
    const r = applyRelationshipUpdate(rel({ affinity: 90, sinceDay: 0 }), { affinityDelta: 50 }, 0);
    expect(r.affinity).toBe(100);
  });
  it("caps evidence to the most recent EVIDENCE_CAP entries", () => {
    let r: Relationship | undefined;
    for (let i = 0; i < EVIDENCE_CAP + 3; i++) {
      r = applyRelationshipUpdate(r, { affinityDelta: 1, reason: `事${i}` }, 0);
    }
    expect(r!.evidence).toHaveLength(EVIDENCE_CAP);
    expect(r!.evidence[r!.evidence.length - 1]).toBe(`事${EVIDENCE_CAP + 2}`);
  });
  it("keeps the prior disposition when no new one is given", () => {
    const prev = rel({ affinity: 10, disposition: "戒备", sinceDay: 0 });
    const r = applyRelationshipUpdate(prev, { affinityDelta: -5 }, 0);
    expect(r.disposition).toBe("戒备");
  });
});
