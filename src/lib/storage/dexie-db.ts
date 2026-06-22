import Dexie, { type Table } from "dexie";
import type { WorldInstance, Message } from "../types";

export class ReveriesDB extends Dexie {
  instances!: Table<WorldInstance, string>;
  messages!: Table<Message, string>;
  constructor(name = "the-reveries") {
    super(name);
    this.version(1).stores({
      instances: "id, seedId, updatedAt",
      messages: "id, instanceId, createdAt",
    });
  }
}
