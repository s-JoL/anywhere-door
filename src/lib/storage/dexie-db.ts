import Dexie, { type Table } from "dexie";
import type { WorldInstance, Message, Memory, WorldSeed } from "../types";

export class ReveriesDB extends Dexie {
  instances!: Table<WorldInstance, string>;
  messages!: Table<Message, string>;
  memories!: Table<Memory, string>;
  seeds!: Table<WorldSeed, string>;
  constructor(name = "the-reveries") {
    super(name);
    this.version(1).stores({
      instances: "id, seedId, updatedAt",
      messages: "id, instanceId, createdAt",
    });
    this.version(2).stores({
      memories: "id, charId, createdAt",
    });
    this.version(3).stores({
      seeds: "id, createdAt",
    });
  }
}
