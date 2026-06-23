import { AnywhereDoorDB } from "./dexie-db";
import type { Repository } from "./repository";
import type { WorldInstance, Message, Memory, WorldSeed, TasteEvent } from "../types";
import type { DeltaLogEntry } from "../world/delta";

export class IndexedDbRepository implements Repository {
  private db = new AnywhereDoorDB();
  async getInstance(id: string) { return this.db.instances.get(id); }
  async upsertInstance(i: WorldInstance) { await this.db.instances.put(i); }
  async listMessages(instanceId: string): Promise<Message[]> {
    const rows = await this.db.messages.where("instanceId").equals(instanceId).toArray();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }
  async appendMessage(m: Message) { await this.db.messages.put(m); }
  async deleteMessages(ids: string[]) {
    if (ids.length === 0) return;
    await this.db.messages.bulkDelete(ids);
  }
  async appendMemory(m: Memory) { await this.db.memories.put(m); }
  async listMemories(charId: string): Promise<Memory[]> {
    const rows = await this.db.memories.where("charId").equals(charId).toArray();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }
  async listAllMemories(): Promise<Memory[]> {
    const rows = await this.db.memories.toArray();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }
  async deleteMemories(ids: string[]) {
    if (ids.length === 0) return;
    await this.db.memories.bulkDelete(ids);
  }
  async getSeed(id: string) { return this.db.seeds.get(id); }
  async listSeeds(): Promise<WorldSeed[]> {
    const rows = await this.db.seeds.toArray();
    return rows.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  }
  async upsertSeed(s: WorldSeed) { await this.db.seeds.put(s); }
  async recordTasteEvent(e: TasteEvent) { await this.db.tasteEvents.put(e); }
  async listTasteEvents(): Promise<TasteEvent[]> {
    const rows = await this.db.tasteEvents.orderBy("at").toArray();
    return rows;
  }
  async appendDeltaLog(e: DeltaLogEntry) { await this.db.deltaLog.put(e); }
  async listDeltaLog(instanceId: string): Promise<DeltaLogEntry[]> {
    const rows = await this.db.deltaLog.where("instanceId").equals(instanceId).toArray();
    return rows.sort((a, b) => a.at - b.at);
  }
}
