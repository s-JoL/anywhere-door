import { describe, it, expect } from "vitest";
import { validateDelta, applyDelta } from "../delta";
import type { WorldState, WorldRules } from "../../types";

const rules: WorldRules = { physics: "无超自然", setting: "现代", redLines: [] };

function baseState(): WorldState {
  return {
    currentLocationId: "bar",
    time: { day: 2, clock: "夜", lighting: "暗" },
    locations: { bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: [], presentCharacterIds: [], objectIds: [] } },
    objects: {},
    roster: {},
    flags: {},
  };
}

describe("§4.6 thread deltas — openThread", () => {
  it("opens an active pressure line with intensity and updatedDay", () => {
    const s = baseState();
    const d = { kind: "openThread", id: "t1", summary: "老周欠赌坊的债快到期了", intensity: 5 } as const;
    expect(validateDelta(s, rules, d).ok).toBe(true);
    const next = applyDelta(s, d);
    const line = next.pressureLines?.find((p) => p.id === "t1");
    expect(line).toMatchObject({ id: "t1", status: "active", intensity: 5, updatedDay: 2 });
  });

  it("rejects a duplicate id or an empty summary", () => {
    const s = applyDelta(baseState(), { kind: "openThread", id: "t1", summary: "x" });
    expect(validateDelta(s, rules, { kind: "openThread", id: "t1", summary: "again" }).ok).toBe(false);
    expect(validateDelta(baseState(), rules, { kind: "openThread", id: "t2", summary: "" }).ok).toBe(false);
  });

  it("clamps intensity to 0..10 and defaults when omitted", () => {
    const next = applyDelta(baseState(), { kind: "openThread", id: "t1", summary: "x", intensity: 99 });
    expect(next.pressureLines![0].intensity).toBe(10);
    const def = applyDelta(baseState(), { kind: "openThread", id: "t2", summary: "y" });
    expect(def.pressureLines![0].intensity).toBeGreaterThan(0);
  });
});

describe("§4.6 thread deltas — advanceThread / resolveThread", () => {
  const withThread = (): WorldState => applyDelta(baseState(), { kind: "openThread", id: "t1", summary: "债务", intensity: 4 });

  it("advanceThread adjusts intensity/summary/status and rejects an unknown id", () => {
    const s = withThread();
    expect(validateDelta(s, rules, { kind: "advanceThread", id: "nope" }).ok).toBe(false);
    const next = applyDelta(s, { kind: "advanceThread", id: "t1", intensityDelta: 3, summary: "债主上门了" });
    expect(next.pressureLines![0].intensity).toBe(7);
    expect(next.pressureLines![0].summary).toBe("债主上门了");
  });

  it("resolveThread marks resolved and rejects re-resolving (no-op)", () => {
    const s = withThread();
    const resolved = applyDelta(s, { kind: "resolveThread", id: "t1" });
    expect(resolved.pressureLines![0].status).toBe("resolved");
    expect(validateDelta(resolved, rules, { kind: "resolveThread", id: "t1" }).ok).toBe(false);
  });

  it("threads only advance through a validated change (validate gates every mutation)", () => {
    // an unknown thread can never be advanced or resolved
    const s = baseState();
    expect(validateDelta(s, rules, { kind: "advanceThread", id: "ghost" }).ok).toBe(false);
    expect(validateDelta(s, rules, { kind: "resolveThread", id: "ghost" }).ok).toBe(false);
  });
});
