import { describe, it, expect, beforeEach } from "vitest";
import { getRepository, resetRepository } from "../index";
import type { WorldSeed } from "../../types";

function makeSeed(id: string, createdAt: number): WorldSeed {
  return {
    id,
    title: `World ${id}`,
    worldview: "test worldview",
    createdAt,
    source: "builtin",
    rules: { physics: "", setting: "", redLines: [] },
    openingState: {
      currentLocationId: "loc1",
      time: { day: 1, clock: "noon", lighting: "bright" },
      locations: {},
      objects: {},
      roster: {},
      flags: {},
    },
    characters: [],
    modelConfig: {
      provider: "openrouter",
      apiKey: "",
      model: "test",
      reasoningEnabled: false,
    },
  };
}

describe("seed store", () => {
  beforeEach(() => {
    resetRepository();
    indexedDB.deleteDatabase("the-reveries");
  });

  it("upserts and gets a seed", async () => {
    const repo = getRepository();
    const seed = makeSeed("s1", 100);
    await repo.upsertSeed(seed);
    const got = await repo.getSeed("s1");
    expect(got?.title).toBe("World s1");
  });

  it("getSeed returns undefined for missing seed", async () => {
    const repo = getRepository();
    expect(await repo.getSeed("missing")).toBeUndefined();
  });

  it("listSeeds returns seeds sorted by createdAt asc", async () => {
    const repo = getRepository();
    await repo.upsertSeed(makeSeed("b", 200));
    await repo.upsertSeed(makeSeed("a", 100));
    await repo.upsertSeed(makeSeed("c", 300));
    const list = await repo.listSeeds();
    expect(list.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("listSeeds falls back to 0 for seeds without createdAt", async () => {
    const repo = getRepository();
    const noTs = makeSeed("no-ts", 0);
    delete (noTs as unknown as Record<string, unknown>).createdAt;
    await repo.upsertSeed(noTs);
    await repo.upsertSeed(makeSeed("with-ts", 50));
    const list = await repo.listSeeds();
    expect(list[0].id).toBe("no-ts");
  });
});
