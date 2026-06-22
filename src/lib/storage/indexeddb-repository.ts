import { ReveriesDB } from "./dexie-db";
import type { Repository } from "./repository";
import type { WorldInstance, Message, Memory } from "../types";

export class IndexedDbRepository implements Repository {
  private db = new ReveriesDB();
  async getInstance(id: string) { return this.db.instances.get(id); }
  async upsertInstance(i: WorldInstance) { await this.db.instances.put(i); }
  async listMessages(instanceId: string): Promise<Message[]> {
    const rows = await this.db.messages.where("instanceId").equals(instanceId).toArray();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }
  async appendMessage(m: Message) { await this.db.messages.put(m); }
  async appendMemory(m: Memory) { await this.db.memories.put(m); }
  async listMemories(charId: string): Promise<Memory[]> {
    const rows = await this.db.memories.where("charId").equals(charId).toArray();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }
}
