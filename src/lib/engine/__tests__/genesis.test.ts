import { describe, it, expect } from "vitest";
import { parseDeltas } from "../reactor";
import { validateDelta, applyDelta } from "../../world/delta";
import { presentCharacters } from "../prompt";
import { DEMO_SEED } from "../../world/seed-demo";
import type { WorldState } from "../../types";

describe("entity genesis primitive (compose)", () => {
  it("a reactor-proposed establishCharacter becomes a present, persistent character", () => {
    const llmText =
      '[{"kind":"establishCharacter","id":"c-stranger","name":"陌生人","role":"角落里一直坐着的人","locationId":"bar"}]';
    const deltas = parseDeltas(llmText);
    expect(deltas).toHaveLength(1);

    let state: WorldState = DEMO_SEED.openingState;
    for (const d of deltas) {
      const v = validateDelta(state, DEMO_SEED.rules, d);
      expect(v.ok).toBe(true);
      if (v.ok) state = applyDelta(state, d);
    }

    // present in the bar scene through the unchanged lookup
    const present = presentCharacters(DEMO_SEED, state);
    expect(present.map((c) => c.id)).toContain("c-stranger");
    const stranger = present.find((c) => c.id === "c-stranger")!;
    expect(stranger).toBeDefined();
    expect(stranger.name).toBe("陌生人");
    expect(stranger.detail).toBe("stub");

    // persisted instance-privately (NOT in the frozen seed) + in roster
    expect(state.characters?.["c-stranger"]).toBeDefined();
    expect(DEMO_SEED.characters.find((c) => c.id === "c-stranger")).toBeUndefined();
    expect(DEMO_SEED.openingState.locations["bar"].presentCharacterIds).not.toContain("c-stranger");
    expect(state.roster["c-stranger"]).toEqual({ name: "陌生人" });
  });

  it("rejects establishCharacter colliding with a seed character id", () => {
    const v = validateDelta(DEMO_SEED.openingState, DEMO_SEED.rules, {
      kind: "establishCharacter",
      id: "c-lan",
      name: "假兰",
      locationId: "bar",
    });
    expect(v.ok).toBe(false);
  });
});
