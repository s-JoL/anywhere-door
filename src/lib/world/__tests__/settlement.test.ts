import { describe, it, expect } from "vitest";
import { deriveSettlement, composeReturnEcho } from "../settlement";
import { applyDelta } from "../delta";
import type { WorldState } from "../../types";

function baseState(): WorldState {
  return {
    currentLocationId: "bar",
    time: { day: 5, clock: "夜", lighting: "暗" },
    locations: { bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: [], presentCharacterIds: [], objectIds: [] } },
    objects: {},
    roster: { "c-lan": { name: "阿岚" }, you: { name: "你" } },
    flags: {},
    relationships: { "c-lan": { you: { affinity: -45, disposition: "记恨在心", evidence: [], sinceDay: 5 } } },
  };
}

describe("§5.6 deriveSettlement", () => {
  it("traces anchored+ facts, lists active threads, and surfaces a bond beat", () => {
    let s = baseState();
    s = applyDelta(s, { kind: "setFact", id: "f1", entityId: "钥匙", field: "hidden", value: "在地板下", hardness: "anchored" });
    s = applyDelta(s, { kind: "setFact", id: "f2", field: "mood", value: "压抑", hardness: "ambient" }); // ambient → not traced
    s = applyDelta(s, { kind: "openThread", id: "t1", summary: "老周欠债未清", intensity: 6, playerKnown: true, nextSign: "收账人会再来" });

    const rec = deriveSettlement(s);
    expect(rec.trace).toContain("钥匙 的 hidden：在地板下");
    expect(rec.trace.some((t) => t.includes("压抑"))).toBe(false); // ambient excluded
    expect(rec.unresolved).toContain("老周欠债未清");
    expect(rec.candidates).toContain("收账人会再来"); // from nextSign
    expect(rec.bond).toMatchObject({ who: "阿岚", stance: "记恨在心" });
    expect(rec.atDay).toBe(5);
  });

  it("omits a candidate for an unknown thread without a nextSign", () => {
    let s = baseState();
    s = applyDelta(s, { kind: "openThread", id: "t1", summary: "暗流", intensity: 5, playerKnown: false });
    const rec = deriveSettlement(s);
    expect(rec.candidates).toEqual([]); // not player-known and no nextSign → no hook leaked
  });
});

describe("§5.6 composeReturnEcho", () => {
  it("builds a return-open beat with elapsed time, bond, and one candidate hook", () => {
    const rec = { trace: [], unresolved: ["老周欠债未清"], candidates: ["收账人会再来"], bond: { who: "阿岚", stance: "记恨在心" }, atDay: 5 };
    const echo = composeReturnEcho(rec, 6);
    expect(echo).toContain("6 小时");
    expect(echo).toContain("阿岚对你的态度：记恨在心");
    expect(echo).toContain("收账人会再来");
  });

  it("falls back to an unresolved line when there is no candidate, and renders days for long absences", () => {
    const rec = { trace: [], unresolved: ["暗流涌动"], candidates: [], atDay: 5 };
    const echo = composeReturnEcho(rec, 48);
    expect(echo).toContain("2 天");
    expect(echo).toContain("悬而未决：暗流涌动");
  });

  it("returns null when there is nothing to echo", () => {
    expect(composeReturnEcho({ trace: [], unresolved: [], candidates: [], atDay: 1 }, 0)).toBeNull();
  });
});
