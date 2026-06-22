import { getRepository } from "../storage";
import { instantiate } from "../world/instance";
import { DEMO_SEED } from "../world/seed-demo";
import { BUILTIN_SEEDS } from "../world/seeds-builtin";
import { nextTime } from "../clock";

/** Upserts all built-in WorldSeeds into storage, always updating to latest definitions.
 *  Preserves original createdAt so feed ordering is stable. Idempotent. */
export async function ensureBuiltinSeeds(): Promise<void> {
  const repo = getRepository();
  for (const seed of BUILTIN_SEEDS) {
    const existing = await repo.getSeed(seed.id);
    await repo.upsertSeed({ ...seed, createdAt: existing?.createdAt ?? nextTime(), source: "builtin" });
  }
}

/** Seeds the demo WorldSeed into storage if absent. Kept for backward compatibility. */
export async function ensureDemoSeed(): Promise<void> {
  const repo = getRepository();
  const existing = await repo.getSeed(DEMO_SEED.id);
  if (!existing) {
    await repo.upsertSeed({ ...DEMO_SEED, createdAt: nextTime(), source: "builtin" });
  }
}

/** Creates a WorldInstance for the given seedId if absent. Returns instanceId. */
export async function ensureInstanceForSeed(seedId: string): Promise<string> {
  const instanceId = `inst-${seedId}`;
  const repo = getRepository();
  const existing = await repo.getInstance(instanceId);
  if (!existing) {
    const seed = await repo.getSeed(seedId);
    if (!seed) throw new Error(`Seed not found: ${seedId}`);
    await repo.upsertInstance(instantiate(seed, nextTime(), instanceId));
  }
  return instanceId;
}

/** Backward-compatible convenience: ensures demo seed + demo instance. */
export async function ensureDemoInstance(): Promise<string> {
  await ensureDemoSeed();
  return ensureInstanceForSeed(DEMO_SEED.id);
}
