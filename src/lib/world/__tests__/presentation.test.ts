import { describe, it, expect } from "vitest";
import { derivePresentation } from "../presentation";
import { DEMO_SEED } from "../seed-demo";
import type { WorldSeed } from "../../types";

// A seed with hand-authored presentation
const SEED_WITH_PRESENTATION: WorldSeed = {
  ...DEMO_SEED,
  id: "test-with-pres",
  presentation: {
    genre: "都市夜谈",
    mood: ["暧昧", "危险"],
    intensity: "charged",
    hook: "你推开那扇门，雨声从身后涌进来。吧台后的女人头也没抬——但你知道她已经把你看透了。",
    entryAction: "接过她推来的空杯",
    cast: [
      { name: "阿岚", line: "無燈的主人，左手旧疤，看人如刀" },
    ],
    accent: "#f0c36b",
  },
};

// A seed WITHOUT authored presentation — derivePresentation must synthesize it
const SEED_WITHOUT_PRESENTATION: WorldSeed = {
  ...DEMO_SEED,
  id: "test-no-pres",
  // presentation: intentionally absent
};
// Ensure no presentation field leaks from spread
delete (SEED_WITHOUT_PRESENTATION as Partial<WorldSeed>).presentation;

describe("derivePresentation", () => {
  it("returns the authored presentation when seed.presentation exists", () => {
    const result = derivePresentation(SEED_WITH_PRESENTATION);
    expect(result).toEqual(SEED_WITH_PRESENTATION.presentation);
  });

  it("derives a fallback when seed.presentation is absent", () => {
    const result = derivePresentation(SEED_WITHOUT_PRESENTATION);
    expect(result).toBeDefined();
    expect(result.genre).toBe("故事");
    expect(result.mood).toEqual([]);
    expect(result.intensity).toBe("charged");
    expect(result.accent).toBe("var(--lamp)");
    expect(result.entryAction.length).toBeGreaterThan(0);
  });

  it("derived hook is non-empty (max 90 chars from description or worldview)", () => {
    const result = derivePresentation(SEED_WITHOUT_PRESENTATION);
    expect(result.hook.length).toBeGreaterThan(0);
    expect(result.hook.length).toBeLessThanOrEqual(90);
  });

  it("derived entryAction is a short direct move, not the generic door label", () => {
    const result = derivePresentation(SEED_WITHOUT_PRESENTATION);
    expect(result.entryAction).not.toMatch(/推门进入|Open the door/);
    expect(result.entryAction.length).toBeGreaterThan(0);
    expect(result.entryAction.length).toBeLessThanOrEqual(24);
  });

  it("does not clip a derived entryAction mid-phrase when source names are long", () => {
    const longNameSeed: WorldSeed = {
      ...DEMO_SEED,
      id: "test-long-name-entry",
      characters: [
        {
          id: "c-long",
          name: "名字长到足以把按钮文案截断的陌生人",
          description: "站在门边的人。",
        },
      ],
      openingState: {
        ...DEMO_SEED.openingState,
        locations: {
          ...DEMO_SEED.openingState.locations,
          bar: {
            ...DEMO_SEED.openingState.locations.bar,
            presentCharacterIds: ["c-long"],
          },
        },
        roster: { "c-long": { name: "名字长到足以把按钮文案截断的陌生人" } },
      },
    };
    delete (longNameSeed as Partial<WorldSeed>).presentation;

    expect(derivePresentation(longNameSeed).entryAction).toBe("问对方一句真话");
  });

  it("derived cast contains only characters present in the opening location, at most 2", () => {
    const result = derivePresentation(SEED_WITHOUT_PRESENTATION);
    expect(result.cast.length).toBeGreaterThanOrEqual(1);
    expect(result.cast.length).toBeLessThanOrEqual(2);
    // Each cast entry has name and line
    for (const entry of result.cast) {
      expect(typeof entry.name).toBe("string");
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.line).toBe("string");
    }
  });

  it("derived cast name matches a character in the opening location", () => {
    const result = derivePresentation(SEED_WITHOUT_PRESENTATION);
    const openingLoc = SEED_WITHOUT_PRESENTATION.openingState.locations[
      SEED_WITHOUT_PRESENTATION.openingState.currentLocationId
    ];
    const presentNames = openingLoc.presentCharacterIds
      .map((id) => SEED_WITHOUT_PRESENTATION.characters.find((c) => c.id === id)?.name)
      .filter(Boolean);
    for (const entry of result.cast) {
      expect(presentNames).toContain(entry.name);
    }
  });

  it("works with a seed that has no characters in the opening location", () => {
    const emptySeed: WorldSeed = {
      ...DEMO_SEED,
      id: "test-empty-loc",
      openingState: {
        ...DEMO_SEED.openingState,
        locations: {
          bar: {
            ...DEMO_SEED.openingState.locations["bar"],
            presentCharacterIds: [],
          },
          street: DEMO_SEED.openingState.locations["street"],
        },
      },
    };
    delete (emptySeed as Partial<WorldSeed>).presentation;
    const result = derivePresentation(emptySeed);
    expect(result.cast).toEqual([]);
    expect(result.hook.length).toBeGreaterThan(0);
  });
});
