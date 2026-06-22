import { getRepository } from "../storage";
import { instantiate } from "../world/instance";
import { DEMO_SEED } from "../world/seed-demo";
import { nextTime } from "../clock";

/** Seeds the demo WorldSeed into storage if absent. */
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
