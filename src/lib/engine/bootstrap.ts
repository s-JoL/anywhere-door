import { getRepository } from "../storage";
import { instantiate } from "../world/instance";
import { DEMO_SEED } from "../world/seed-demo";
import { nextTime } from "../clock";

const DEMO_INSTANCE_ID = "demo-instance-1";

/** 首启用 demo 种子建一个私有实例；已存在则复用。 */
export async function ensureDemoInstance(): Promise<string> {
  const repo = getRepository();
  const existing = await repo.getInstance(DEMO_INSTANCE_ID);
  if (!existing) {
    await repo.upsertInstance(instantiate(DEMO_SEED, nextTime(), DEMO_INSTANCE_ID));
  }
  return DEMO_INSTANCE_ID;
}
