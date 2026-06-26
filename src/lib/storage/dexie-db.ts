import Dexie, { type Table } from "dexie";
import type { WorldInstance, Message, Memory, WorldSeed, TasteEvent, TimelineBranch } from "../types";
import type { DeltaLogEntry } from "../world/delta";

export class AnywhereDoorDB extends Dexie {
  instances!: Table<WorldInstance, string>;
  messages!: Table<Message, string>;
  memories!: Table<Memory, string>;
  seeds!: Table<WorldSeed, string>;
  tasteEvents!: Table<TasteEvent, string>;
  deltaLog!: Table<DeltaLogEntry, string>;
  timelineBranches!: Table<TimelineBranch, string>;
  constructor(name = "anywhere-door") {
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
    this.version(4).stores({
      tasteEvents: "id, at, seedId",
    });
    this.version(5).stores({
      deltaLog: "id, instanceId, [instanceId+turn], at",
    });
    this.version(6).stores({
      timelineBranches: "id, instanceId, updatedAt, [instanceId+updatedAt]",
    });
    this.version(7).stores({
      memories: "id, instanceId, charId, [instanceId+charId], createdAt, [instanceId+createdAt]",
    });
  }
}
