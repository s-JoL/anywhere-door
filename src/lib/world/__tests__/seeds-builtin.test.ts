import { describe, it, expect } from "vitest";
import { BUILTIN_SEEDS } from "../seeds-builtin";
import { validateDelta } from "../delta";
import type { WorldSeed } from "../../types";

describe("relay-station seed: SEREN-7's locked airlock", () => {
  const relay = BUILTIN_SEEDS.find((s) => s.id === "seed-builtin-relay")!;

  it("has a locked door in the control room that gates the airlock", () => {
    const { objects } = relay.openingState;
    const door = Object.values(objects).find((o) => o.props.gates === "airlock" && o.props.locked === true);
    expect(door).toBeDefined();
    expect(door!.locationId).toBe("control-room");
  });

  it("blocks the camera from entering the airlock while it is locked", () => {
    const r = validateDelta(relay.openingState, relay.rules, { kind: "moveScene", toLocationId: "airlock" });
    expect(r.ok).toBe(false);
  });
});

describe("BUILTIN_SEEDS", () => {
  it("has at least 3 seeds", () => {
    expect(BUILTIN_SEEDS.length).toBeGreaterThanOrEqual(3);
  });

  it("has unique ids", () => {
    const ids = BUILTIN_SEEDS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("first seed is DEMO_SEED (seed-demo-tavern)", () => {
    expect(BUILTIN_SEEDS[0].id).toBe("seed-demo-tavern");
  });

  describe.each(BUILTIN_SEEDS.map((s) => [s.title, s] as [string, WorldSeed]))(
    "seed %s",
    (_title, seed) => {
      it("has non-empty id, title, worldview", () => {
        expect(seed.id.length).toBeGreaterThan(0);
        expect(seed.title.length).toBeGreaterThan(0);
        expect(seed.worldview.length).toBeGreaterThan(0);
      });

      it("currentLocationId exists in locations", () => {
        const { currentLocationId, locations } = seed.openingState;
        expect(locations[currentLocationId]).toBeDefined();
      });

      it("every presentCharacterId in opening location exists in characters[] and roster", () => {
        const { locations, roster } = seed.openingState;
        const opening = locations[seed.openingState.currentLocationId];
        const charIds = seed.characters.map((c) => c.id);
        for (const pid of opening.presentCharacterIds) {
          expect(charIds).toContain(pid);
          expect(roster[pid]).toBeDefined();
        }
      });

      it("each character has non-empty name and description", () => {
        for (const char of seed.characters) {
          expect(char.name.length).toBeGreaterThan(0);
          expect(char.description.length).toBeGreaterThan(0);
        }
      });

      it("has at least 2 characters", () => {
        expect(seed.characters.length).toBeGreaterThanOrEqual(2);
      });

      it("opening location has at least 2 presentCharacterIds", () => {
        const opening = seed.openingState.locations[seed.openingState.currentLocationId];
        expect(opening.presentCharacterIds.length).toBeGreaterThanOrEqual(2);
      });

      it("has valid rules.physics and rules.setting", () => {
        expect(seed.rules.physics.length).toBeGreaterThan(0);
        expect(seed.rules.setting.length).toBeGreaterThan(0);
      });

      it("has a presentation with non-empty hook, genre, and at least 1 cast member", () => {
        expect(seed.presentation).toBeDefined();
        expect(seed.presentation!.hook.length).toBeGreaterThan(0);
        expect(seed.presentation!.genre.length).toBeGreaterThan(0);
        expect(seed.presentation!.cast.length).toBeGreaterThanOrEqual(1);
      });
    }
  );
});
