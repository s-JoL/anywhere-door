import type { Repository } from "../storage";
import { recordKeyAdd } from "./funnel";

export function sampledWorldIdFromSettingsSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("from") !== "prebaked-taste") return null;
  const worldId = params.get("world")?.trim();
  return worldId || null;
}

export async function recordKeyAddFromSettingsSearch(repo: Repository, search: string): Promise<void> {
  const worldId = sampledWorldIdFromSettingsSearch(search);
  if (!worldId) return;
  const seed = await repo.getSeed(worldId);
  if (seed) recordKeyAdd(repo, seed);
}
