import { describe, it, expect } from "vitest";
import { computeFunnel, FUNNEL_STAGES } from "../funnel";
import type { TasteEvent } from "../../types";

const ev = (kind: TasteEvent["kind"], n = 1): TasteEvent[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${kind}-${i}`, kind, seedId: "s", tags: [], at: i }));

describe("§5.9 computeFunnel", () => {
  it("counts each funnel stage and ignores ranking-only taste events", () => {
    const events = [...ev("card-dwell", 10), ...ev("open-door", 5), ...ev("pin", 1), ...ev("enter", 3)];
    const { counts } = computeFunnel(events);
    expect(counts["card-dwell"]).toBe(10);
    expect(counts["open-door"]).toBe(5);
    expect(counts["pin"]).toBe(1);
    // ranking-only "enter" is not a funnel stage
    expect((counts as Record<string, number>)["enter"]).toBeUndefined();
  });

  it("computes step-to-step conversion, guarding divide-by-zero", () => {
    const { conversion } = computeFunnel([...ev("card-dwell", 10), ...ev("open-door", 4)]);
    expect(conversion["card-dwell→open-door"]).toBeCloseTo(0.4);
    // open-door → first-action has zero first-action → conversion 0
    expect(conversion["open-door→first-action"]).toBe(0);
  });

  it("returns all-zero counts for an empty stream", () => {
    const { counts } = computeFunnel([]);
    for (const s of FUNNEL_STAGES) expect(counts[s]).toBe(0);
  });
});
