import { describe, it, expect } from "vitest";
import { tagsOfSeed } from "../tags";
import type { WorldSeed } from "@/lib/types";
import { DEMO_SEED } from "@/lib/world/seed-demo";

// A seed WITH authored presentation
const AUTHORED_SEED: WorldSeed = {
  ...DEMO_SEED,
  presentation: { genre: "都市悬疑", mood: ["暧昧", "危险"], intensity: "charged", hook: "...", entryAction: "开始行动", cast: [] },
};

// A seed WITHOUT presentation (will derive fallback)
const BARE_SEED: WorldSeed = { ...DEMO_SEED, presentation: undefined };

describe("tagsOfSeed", () => {
  it("returns correct namespaced tags for authored presentation", () => {
    const tags = tagsOfSeed(AUTHORED_SEED);
    expect(tags).toContain("genre:都市悬疑");
    expect(tags).toContain("mood:暧昧");
    expect(tags).toContain("mood:危险");
    expect(tags).toContain("intensity:charged");
  });

  it("deduplicates tags", () => {
    const tags = tagsOfSeed(AUTHORED_SEED);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("derives non-empty tags for seed without presentation", () => {
    const tags = tagsOfSeed(BARE_SEED);
    const genreTags = tags.filter((t) => t.startsWith("genre:"));
    const intensityTags = tags.filter((t) => t.startsWith("intensity:"));
    expect(genreTags.length).toBeGreaterThan(0);
    expect(intensityTags.length).toBeGreaterThan(0);
  });
});
