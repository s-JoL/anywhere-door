import { describe, it, expect } from "vitest";
import { castTurn, decideSurfacing } from "../director";
import { DEMO_SEED } from "../../world/seed-demo";
import type { WorldState } from "../../types";

describe("castTurn (§4.3 active/ambient split)", () => {
  it("keeps everyone active when present count is within the cap", () => {
    const c = castTurn({ seed: DEMO_SEED, state: DEMO_SEED.openingState });
    expect(c.active).toEqual(["c-lan", "c-zhou"]);
    expect(c.ambient).toEqual([]);
  });

  it("caps the active set and pushes the overflow to ambient", () => {
    const c = castTurn({ seed: DEMO_SEED, state: DEMO_SEED.openingState, maxActive: 1 });
    expect(c.active).toEqual(["c-lan"]);
    expect(c.ambient).toEqual(["c-zhou"]);
    // never more than the cap run as agents
    expect(c.active.length).toBeLessThanOrEqual(1);
  });
});

describe("decideSurfacing (§4.3 world-consistent surfacing)", () => {
  // A state where c-zhou is offstage (only c-lan present in bar).
  const withZhouOffstage = (): WorldState => ({
    ...DEMO_SEED.openingState,
    locations: {
      ...DEMO_SEED.openingState.locations,
      bar: { ...DEMO_SEED.openingState.locations["bar"], presentCharacterIds: ["c-lan"] },
    },
  });

  it("returns null below the tension threshold", () => {
    expect(decideSurfacing(DEMO_SEED, withZhouOffstage(), 5)).toBeNull();
  });

  it("surfaces an offstage character (never a present one) at/above the threshold, from the adjacent world", () => {
    const s = decideSurfacing(DEMO_SEED, withZhouOffstage(), 6);
    expect(s).not.toBeNull();
    expect(s!.who).toBe("c-zhou");          // the offstage one
    expect(s!.how).not.toBe(undefined);
    // world-consistent: the surfaced character is NOT already present
    expect(withZhouOffstage().locations["bar"].presentCharacterIds).not.toContain(s!.who);
  });

  it("returns null when there is no offstage character to surface", () => {
    // place every seed character on-stage → nobody left to bring in
    const allPresent: WorldState = {
      ...DEMO_SEED.openingState,
      locations: {
        ...DEMO_SEED.openingState.locations,
        bar: { ...DEMO_SEED.openingState.locations["bar"], presentCharacterIds: DEMO_SEED.characters.map((c) => c.id) },
      },
    };
    expect(decideSurfacing(DEMO_SEED, allPresent, 9)).toBeNull();
  });
});
