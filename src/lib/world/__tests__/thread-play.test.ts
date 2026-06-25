import { describe, it, expect } from "vitest";
import { validateDelta, applyDelta } from "../delta";
import { selectActiveThreads } from "../../engine/director";
import type { WorldState, WorldRules } from "../../types";

const rules: WorldRules = { physics: "无超自然", setting: "现代", redLines: [] };

function baseState(): WorldState {
  return {
    currentLocationId: "bar",
    time: { day: 2, clock: "夜", lighting: "暗" },
    locations: { bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: [], presentCharacterIds: [], objectIds: [] } },
    objects: {}, roster: {}, flags: {},
  };
}

describe("§5.2 richer thread fields", () => {
  it("openThread carries kind / playerKnown / nextSign", () => {
    const s = applyDelta(baseState(), {
      kind: "openThread", id: "t1", summary: "老周欠债", intensity: 4,
      threadKind: "debt", playerKnown: false, nextSign: "门口多了个陌生面孔",
    });
    expect(s.pressureLines![0]).toMatchObject({ kind: "debt", playerKnown: false, nextSign: "门口多了个陌生面孔" });
  });

  it("advanceThread can reveal the thread to the player (set playerKnown)", () => {
    let s = applyDelta(baseState(), { kind: "openThread", id: "t1", summary: "债", intensity: 4 });
    s = applyDelta(s, { kind: "advanceThread", id: "t1", playerKnown: true, nextSign: "收账人进了门" });
    expect(s.pressureLines![0].playerKnown).toBe(true);
    expect(s.pressureLines![0].nextSign).toBe("收账人进了门");
  });
});

describe("§5.2 fairness rule — no strong consequence while the player knows nothing", () => {
  it("rejects pushing an unknown thread to strong intensity", () => {
    const s = applyDelta(baseState(), { kind: "openThread", id: "t1", summary: "债", intensity: 6, playerKnown: false });
    // +3 → 9 (>= strong 8) while unknown → rejected
    expect(validateDelta(s, rules, { kind: "advanceThread", id: "t1", intensityDelta: 3 }).ok).toBe(false);
  });

  it("allows the strong escalation once the same delta reveals it to the player", () => {
    const s = applyDelta(baseState(), { kind: "openThread", id: "t1", summary: "债", intensity: 6, playerKnown: false });
    expect(validateDelta(s, rules, { kind: "advanceThread", id: "t1", intensityDelta: 3, playerKnown: true }).ok).toBe(true);
  });

  it("allows escalation to strong when the thread is already player-known", () => {
    const s = applyDelta(baseState(), { kind: "openThread", id: "t1", summary: "债", intensity: 6, playerKnown: true });
    expect(validateDelta(s, rules, { kind: "advanceThread", id: "t1", intensityDelta: 3 }).ok).toBe(true);
  });

  it("allows mild escalation of an unknown thread (below the strong threshold)", () => {
    const s = applyDelta(baseState(), { kind: "openThread", id: "t1", summary: "债", intensity: 4, playerKnown: false });
    expect(validateDelta(s, rules, { kind: "advanceThread", id: "t1", intensityDelta: 2 }).ok).toBe(true); // →6, fine
  });
});

describe("§5.2 selectActiveThreads — Director picks 1–2", () => {
  it("returns the highest-intensity active threads, capped, skipping resolved", () => {
    let s = baseState();
    s = applyDelta(s, { kind: "openThread", id: "a", summary: "x", intensity: 3 });
    s = applyDelta(s, { kind: "openThread", id: "b", summary: "y", intensity: 9, playerKnown: true });
    s = applyDelta(s, { kind: "openThread", id: "c", summary: "z", intensity: 6 });
    s = applyDelta(s, { kind: "resolveThread", id: "a" });
    const picked = selectActiveThreads(s, 2);
    expect(picked.map((p) => p.id)).toEqual(["b", "c"]); // by intensity desc, resolved 'a' excluded
  });

  it("returns [] when there are no pressure lines", () => {
    expect(selectActiveThreads(baseState())).toEqual([]);
  });
});
