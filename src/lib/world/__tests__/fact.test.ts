import { describe, it, expect } from "vitest";
import { validateDelta, applyDelta } from "../delta";
import type { WorldState, WorldRules } from "../../types";

const rules: WorldRules = { physics: "无超自然", setting: "现代", redLines: [] };

function baseState(): WorldState {
  return {
    currentLocationId: "bar",
    time: { day: 3, clock: "夜", lighting: "暗" },
    locations: { bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: [], presentCharacterIds: [], objectIds: [] } },
    objects: {},
    roster: { c1: { name: "甲" } },
    flags: {},
  };
}

describe("§5.1 setFact — structure + apply", () => {
  it("creates a fact and upserts by (entityId, field)", () => {
    let s = baseState();
    s = applyDelta(s, { kind: "setFact", id: "f1", entityId: "key", field: "hidden", value: "在地板下", hardness: "anchored" });
    expect(s.facts).toHaveLength(1);
    expect(s.facts![0]).toMatchObject({ entityId: "key", field: "hidden", value: "在地板下", hardness: "anchored", sinceDay: 3 });
    // a new value for the same (entity, field) replaces, not appends
    s = applyDelta(s, { kind: "setFact", id: "f2", entityId: "key", field: "hidden", value: "在地板下", hardness: "core" });
    expect(s.facts).toHaveLength(1);
    expect(s.facts![0].hardness).toBe("core"); // hardened, same value
  });

  it("rejects malformed facts (empty id/field/value)", () => {
    const s = baseState();
    expect(validateDelta(s, rules, { kind: "setFact", id: "", field: "x", value: "y" }).ok).toBe(false);
    expect(validateDelta(s, rules, { kind: "setFact", id: "f", field: "", value: "y" }).ok).toBe(false);
    expect(validateDelta(s, rules, { kind: "setFact", id: "f", field: "x", value: "" }).ok).toBe(false);
  });

  it("defaults hardness to ambient", () => {
    const s = applyDelta(baseState(), { kind: "setFact", id: "f", field: "mood", value: "紧张" });
    expect(s.facts![0].hardness).toBe("ambient");
  });
});

describe("§5.1 canon hardness — contradiction rule", () => {
  const withAnchored = (): WorldState =>
    applyDelta(baseState(), { kind: "setFact", id: "f1", entityId: "key", field: "hidden", value: "在地板下", hardness: "anchored" });

  it("non-god proposals cannot overturn an anchored fact, even at equal hardness", () => {
    const s = withAnchored();
    // ambient contradiction of an anchored fact → rejected
    const r = validateDelta(s, rules, { kind: "setFact", id: "f2", entityId: "key", field: "hidden", value: "被人拿走了", hardness: "ambient" });
    expect(r.ok).toBe(false);
    // equal hardness still cannot silently revise anchored canon unless authored through God.
    const rEq = validateDelta(s, rules, { kind: "setFact", id: "f3", entityId: "key", field: "hidden", value: "被人拿走了", hardness: "anchored" }, "reactor");
    expect(rEq.ok).toBe(false);
  });

  it("god may revise an anchored fact with authored provenance", () => {
    const s = withAnchored();
    const r = validateDelta(s, rules, { kind: "setFact", id: "f-god", entityId: "key", field: "hidden", value: "被老周拿走了", hardness: "anchored" }, "god");
    expect(r.ok).toBe(true);
  });

  it("re-asserting the same value never conflicts", () => {
    const s = withAnchored();
    expect(validateDelta(s, rules, { kind: "setFact", id: "f2", entityId: "key", field: "hidden", value: "在地板下", hardness: "ambient" }).ok).toBe(true);
  });

  it("re-asserting the same value cannot downgrade applied hardness", () => {
    const s = withAnchored();
    const next = applyDelta(s, {
      kind: "setFact",
      id: "f2",
      entityId: "key",
      field: "hidden",
      value: "在地板下",
      hardness: "ambient",
    });

    expect(next.facts).toHaveLength(1);
    expect(next.facts![0]).toMatchObject({
      entityId: "key",
      field: "hidden",
      value: "在地板下",
      hardness: "anchored",
    });
  });

  it("a harder claim can overwrite a softer fact (facts harden when earned)", () => {
    const s = applyDelta(baseState(), { kind: "setFact", id: "f1", entityId: "door", field: "state", value: "虚掩", hardness: "ambient" });
    expect(validateDelta(s, rules, { kind: "setFact", id: "f2", entityId: "door", field: "state", value: "锁死", hardness: "anchored" }).ok).toBe(true);
  });
});

describe("§5.1 source authority (raising authority never bypasses the gate)", () => {
  it("non-god sources cannot mint a core fact; god can", () => {
    const s = baseState();
    expect(validateDelta(s, rules, { kind: "setFact", id: "f", field: "law", value: "魔法存在", hardness: "core" }, "reactor").ok).toBe(false);
    expect(validateDelta(s, rules, { kind: "setFact", id: "f", field: "law", value: "魔法存在", hardness: "core" }, "god").ok).toBe(true);
  });

  it("non-god sources may write up to anchored", () => {
    const s = baseState();
    expect(validateDelta(s, rules, { kind: "setFact", id: "f", field: "x", value: "y", hardness: "anchored" }, "reactor").ok).toBe(true);
  });

  it("only god may revise an anchored fact to a contradictory core value", () => {
    const s = applyDelta(baseState(), { kind: "setFact", id: "f1", entityId: "k", field: "h", value: "A", hardness: "anchored" });
    // god writes a contradictory core fact — allowed (revises anchored, pays reconcile in §5.8)
    expect(validateDelta(s, rules, { kind: "setFact", id: "f2", entityId: "k", field: "h", value: "B", hardness: "core" }, "god").ok).toBe(true);
    // reactor attempting the same core write is blocked by authority before contradiction even matters
    expect(validateDelta(s, rules, { kind: "setFact", id: "f3", entityId: "k", field: "h", value: "B", hardness: "core" }, "reactor").ok).toBe(false);
  });
});
