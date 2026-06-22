import { describe, it, expect, beforeEach } from "vitest";
import { ensureDemoInstance, ensureDemoSeed, ensureInstanceForSeed } from "../bootstrap";
import { getRepository, resetRepository } from "../../storage";
import { DEMO_SEED } from "../../world/seed-demo";

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
});
