import { describe, it, expect } from "vitest";
import { computeFunnel, FUNNEL_STAGES, recordKeyAdd, recordPrebakedTaste } from "../funnel";
import { DEMO_SEED } from "../../world/seed-demo";
import type { Repository } from "../../storage";
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

  it("tracks the keyless taste to key-add to first-action cliff separately", () => {
    const events = [...ev("prebaked-taste", 5), ...ev("key-add", 2), ...ev("first-action", 1)];
    const { counts, conversion } = computeFunnel(events);

    expect(counts["prebaked-taste"]).toBe(5);
    expect(counts["key-add"]).toBe(2);
    expect(conversion["prebaked-taste→key-add"]).toBeCloseTo(0.4);
    expect(conversion["key-add→first-action"]).toBeCloseTo(0.5);
  });
});

describe("§5.9 keyless funnel record helpers", () => {
  it("records pre-baked taste and key-add with seed tags", async () => {
    const captured: TasteEvent[] = [];
    const repo = {
      recordTasteEvent: async (event: TasteEvent) => { captured.push(event); },
    } as Repository;

    recordPrebakedTaste(repo, DEMO_SEED);
    recordKeyAdd(repo, DEMO_SEED);
    await Promise.resolve();

    expect(captured.map((event) => event.kind)).toEqual(["prebaked-taste", "key-add"]);
    expect(captured.every((event) => event.seedId === DEMO_SEED.id)).toBe(true);
    expect(captured.every((event) => event.tags.length > 0)).toBe(true);
  });
});
