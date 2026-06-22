import { describe, it, expect, beforeEach } from "vitest";
import { ensureDemoInstance, ensureDemoSeed, ensureInstanceForSeed, ensureBuiltinSeeds } from "../bootstrap";
import { getRepository, resetRepository } from "../../storage";
import { DEMO_SEED } from "../../world/seed-demo";
import { BUILTIN_SEEDS } from "../../world/seeds-builtin";

describe("bootstrap", () => {
  beforeEach(() => {
    resetRepository();
    indexedDB.deleteDatabase("the-reveries");
  });

  describe("ensureDemoInstance (legacy compat)", () => {
    it("creates the demo instance once and reuses it", async () => {
      const a = await ensureDemoInstance();
      const b = await ensureDemoInstance();
      expect(a).toBe(b);
      expect(await getRepository().getInstance(a)).toBeDefined();
    });
  });

  describe("ensureDemoSeed", () => {
    it("stores DEMO_SEED into repository", async () => {
      await ensureDemoSeed();
      const stored = await getRepository().getSeed(DEMO_SEED.id);
      expect(stored).toBeDefined();
      expect(stored?.title).toBe(DEMO_SEED.title);
    });
    it("sets source=builtin and createdAt", async () => {
      await ensureDemoSeed();
      const stored = await getRepository().getSeed(DEMO_SEED.id);
      expect(stored?.source).toBe("builtin");
      expect(typeof stored?.createdAt).toBe("number");
    });
    it("is idempotent — second call does not overwrite", async () => {
      await ensureDemoSeed();
      const first = await getRepository().getSeed(DEMO_SEED.id);
      await ensureDemoSeed();
      const second = await getRepository().getSeed(DEMO_SEED.id);
      expect(second?.createdAt).toBe(first?.createdAt);
    });
  });

  describe("ensureInstanceForSeed", () => {
    it("creates instance with id inst-<seedId>", async () => {
      await ensureDemoSeed();
      const id = await ensureInstanceForSeed(DEMO_SEED.id);
      expect(id).toBe(`inst-${DEMO_SEED.id}`);
      expect(await getRepository().getInstance(id)).toBeDefined();
    });
    it("throws if seed is missing", async () => {
      await expect(ensureInstanceForSeed("nonexistent-seed")).rejects.toThrow("Seed not found");
    });
    it("is idempotent — second call returns same instanceId", async () => {
      await ensureDemoSeed();
      const a = await ensureInstanceForSeed(DEMO_SEED.id);
      const b = await ensureInstanceForSeed(DEMO_SEED.id);
      expect(a).toBe(b);
    });
  });

  describe("ensureBuiltinSeeds", () => {
    it("stores all BUILTIN_SEEDS into repository", async () => {
      await ensureBuiltinSeeds();
      for (const builtin of BUILTIN_SEEDS) {
        const stored = await getRepository().getSeed(builtin.id);
        expect(stored).toBeDefined();
        expect(stored?.title).toBe(builtin.title);
      }
    });
    it("sets source=builtin and createdAt for all seeds", async () => {
      await ensureBuiltinSeeds();
      for (const builtin of BUILTIN_SEEDS) {
        const stored = await getRepository().getSeed(builtin.id);
        expect(stored?.source).toBe("builtin");
        expect(typeof stored?.createdAt).toBe("number");
      }
    });
    it("updates existing builtin seeds to latest definition", async () => {
      // Pre-populate with a stale version of the first builtin seed
      const builtinToUpdate = BUILTIN_SEEDS[0];
      if (!builtinToUpdate) return; // skip if no builtins exist
      const repo = getRepository();
      const originalCreatedAt = 999999;
      const staledSeed = { ...builtinToUpdate, title: "OLD_TITLE", createdAt: originalCreatedAt, source: "builtin" as const };
      await repo.upsertSeed(staledSeed);

      // Verify stale state exists
      let stored = await repo.getSeed(builtinToUpdate.id);
      expect(stored?.title).toBe("OLD_TITLE");

      // Call ensureBuiltinSeeds — should update to current definition
      await ensureBuiltinSeeds();
      stored = await repo.getSeed(builtinToUpdate.id);

      // Verify title is updated to current builtin
      expect(stored?.title).toBe(builtinToUpdate.title);
      // Verify createdAt is preserved
      expect(stored?.createdAt).toBe(originalCreatedAt);
    });
    it("preserves createdAt across multiple calls (stable feed ordering)", async () => {
      await ensureBuiltinSeeds();
      const firstCall = await getRepository().getSeed(BUILTIN_SEEDS[0].id);
      const firstCreatedAt = firstCall?.createdAt;

      await ensureBuiltinSeeds();
      const secondCall = await getRepository().getSeed(BUILTIN_SEEDS[0].id);
      const secondCreatedAt = secondCall?.createdAt;

      expect(secondCreatedAt).toBe(firstCreatedAt);
    });
  });
});
