import { describe, it, expect } from "vitest";
import { deriveSettlement, composeReturnEcho, settlementLibraryHook } from "../settlement";
import { applyDelta } from "../delta";
import type { WorldState } from "../../types";

function baseState(): WorldState {
  return {
    currentLocationId: "bar",
    time: { day: 5, clock: "夜", lighting: "暗" },
    locations: { bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: [], presentCharacterIds: [], objectIds: [] } },
    objects: {
      "o-key": {
        id: "o-key",
        name: "铜钥匙",
        detail: "fleshed",
        props: {},
        locationId: "bar",
      },
    },
    roster: { "c-lan": { name: "阿岚" }, you: { name: "你" } },
    flags: {},
    relationships: { "c-lan": { you: { affinity: -45, disposition: "记恨在心", evidence: [], sinceDay: 5 } } },
  };
}

describe("§5.6 deriveSettlement", () => {
  it("traces anchored+ facts, lists active threads, and surfaces a bond beat", () => {
    let s = baseState();
    s = applyDelta(s, { kind: "setFact", id: "f1", entityId: "o-key", field: "hidden", value: "地板下", hardness: "anchored" });
    (s.facts![0] as { playerKnown?: boolean }).playerKnown = true;
    s = applyDelta(s, { kind: "setFact", id: "f2", field: "mood", value: "压抑", hardness: "ambient" }); // ambient → not traced
    s = applyDelta(s, { kind: "openThread", id: "t1", summary: "老周欠债未清", intensity: 6, playerKnown: true, nextSign: "收账人会再来" });

    const rec = deriveSettlement(s);
    expect(rec.trace).toContain("铜钥匙藏在地板下");
    expect(rec.trace.some((t) => t.includes("压抑"))).toBe(false); // ambient excluded
    expect(rec.unresolved).toContain("老周欠债未清");
    expect(rec.candidates).toContain("收账人会再来"); // from nextSign
    expect(rec.bond).toMatchObject({ who: "阿岚", stance: "记恨在心" });
    expect(rec.atDay).toBe(5);
  });

  it("synthesizes a non-leaking candidate for an unknown thread without a nextSign", () => {
    let s = baseState();
    s = applyDelta(s, { kind: "openThread", id: "t1", summary: "暗流", intensity: 5, playerKnown: false });
    const rec = deriveSettlement(s);
    expect(rec.unresolved).toEqual([]);
    expect(rec.candidates).toHaveLength(1); // synthesize a forward pull without leaking the hidden summary
    expect(JSON.stringify(rec)).not.toContain("暗流");
  });

  it("does not trace anchored facts that are not player-known", () => {
    let s = baseState();
    s = applyDelta(s, { kind: "setFact", id: "f1", entityId: "o-key", field: "hidden", value: "地板下", hardness: "anchored" });
    const rec = deriveSettlement(s);
    expect(rec.trace.join("\n")).not.toContain("地板下");
  });

  it("uses the forward candidate as the library hook before replaying past trace", () => {
    const rec = {
      trace: ["铜钥匙藏在地板下"],
      unresolved: ["老周欠债未清"],
      candidates: ["收账人会再来"],
      bond: { who: "阿岚", stance: "记恨在心" },
      atDay: 5,
    };
    expect(settlementLibraryHook(rec)).toBe("收账人会再来");
  });

  it("turns a committed local relationship change into a character reaction hook", () => {
    const s = baseState();
    s.locations.bar.presentCharacterIds = ["c-lan"];

    const rec = deriveSettlement(s, [
      {
        kind: "setRelationship",
        fromId: "c-lan",
        toId: "you",
        affinityDelta: 18,
        disposition: "松动了戒心",
        reason: "你替她挡下收账人",
      },
    ]);

    expect(rec.candidates[0]).toBe("阿岚还记着你替她挡下收账人，等你回应");
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

  it("surfaces the player's left-behind trace as a return consequence", () => {
    const rec = {
      trace: ["铜钥匙藏在地板下"],
      unresolved: ["老周欠债未清"],
      candidates: ["收账人会再来"],
      bond: { who: "阿岚", stance: "记恨在心" },
      atDay: 5,
    };
    const echo = composeReturnEcho(rec, 6);
    expect(echo).toContain("你留下的痕迹还在：铜钥匙藏在地板下");
  });

  it("still emits a return echo when trace is the only pull", () => {
    const rec = { trace: ["铜钥匙藏在地板下"], unresolved: [], candidates: [], atDay: 5 };
    expect(composeReturnEcho(rec, 0)).toContain("铜钥匙藏在地板下");
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
