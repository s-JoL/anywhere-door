import type { WorldSeed, WorldInstance } from "../types";

export function instantiate(seed: WorldSeed, now: number, id: string): WorldInstance {
  return {
    id,
    seedId: seed.id,
    state: structuredClone(seed.openingState),
    createdAt: now,
    updatedAt: now,
  };
}
