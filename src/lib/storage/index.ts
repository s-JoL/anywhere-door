import { IndexedDbRepository } from "./indexeddb-repository";
import type { Repository } from "./repository";

let repo: Repository | null = null;
export function getRepository(): Repository {
  if (!repo) repo = new IndexedDbRepository();
  return repo;
}
export function resetRepository(): void {
  repo = null;
}
export type { Repository };
