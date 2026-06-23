import type { Repository } from "@/lib/storage";
import type { TasteEvent, TasteEventKind, WorldSeed } from "@/lib/types";
import { tagsOfSeed } from "./tags";

function makeEvent(kind: TasteEventKind, seed: WorldSeed): TasteEvent {
  const at = Date.now();
  return { id: `${kind}-${at}-${seed.id}`, kind, seedId: seed.id, tags: tagsOfSeed(seed), at };
}

export function recordEnter(repo: Repository, seed: WorldSeed): void {
  void repo.recordTasteEvent(makeEvent("enter", seed));
}
export function recordDwell(repo: Repository, seed: WorldSeed): void {
  void repo.recordTasteEvent(makeEvent("dwell", seed));
}
export function recordAuthor(repo: Repository, seed: WorldSeed): void {
  void repo.recordTasteEvent(makeEvent("author", seed));
}
export function recordSkip(repo: Repository, seed: WorldSeed): void {
  void repo.recordTasteEvent(makeEvent("skip", seed));
}
