import { AnywhereDoorDB } from "./dexie-db";
import type { Repository } from "./repository";
import type { WorldInstance, Message, Memory, WorldSeed, TasteEvent, TimelineBranch } from "../types";
import type { DeltaLogEntry } from "../world/delta";

export class IndexedDbRepository implements Repository {
  private db = new AnywhereDoorDB();
  private isActive<T extends { archived?: boolean }>(row: T): boolean {
    return row.archived !== true;
  }
  private sortMemories(rows: Memory[]): Memory[] {
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }
  private async canRepairLegacyMemories(instanceId: string): Promise<boolean> {
    const instances = await this.db.instances.toArray();
    return instances.length === 1 && instances[0].id === instanceId;
  }
  private async repairLegacyMemories(instanceId: string, charId?: string): Promise<Memory[]> {
    if (!(await this.canRepairLegacyMemories(instanceId))) return [];
    const collection = charId
      ? this.db.memories.where("charId").equals(charId)
      : this.db.memories.toCollection();
    const rows = await collection
      .filter((memory) => this.isActive(memory) && !(memory as Partial<Memory>).instanceId)
      .toArray();
    const repaired = rows.map((memory) => ({ ...memory, instanceId }));
    if (repaired.length > 0) await this.db.memories.bulkPut(repaired);
    return repaired;
  }
  private async ambiguousLegacyMemories(): Promise<Memory[]> {
    const rows = await this.db.memories
      .toCollection()
      .filter((memory) => !(memory as Partial<Memory>).instanceId)
      .toArray();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }
  async getInstance(id: string) { return this.db.instances.get(id); }
  async listInstances(): Promise<WorldInstance[]> {
    const rows = await this.db.instances.toArray();
    return rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }
  async upsertInstance(i: WorldInstance) { await this.db.instances.put(i); }
  async listMessages(instanceId: string): Promise<Message[]> {
    const rows = await this.db.messages.where("instanceId").equals(instanceId).toArray();
    return rows.filter((row) => this.isActive(row)).sort((a, b) => a.createdAt - b.createdAt);
  }
  async listAuditMessages(instanceId: string): Promise<Message[]> {
    const rows = await this.db.messages.where("instanceId").equals(instanceId).toArray();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }
  async appendMessage(m: Message) { await this.db.messages.put(m); }
  async deleteMessages(ids: string[]) {
    if (ids.length === 0) return;
    const rows = (await this.db.messages.bulkGet(ids)).filter((row): row is Message => !!row);
    if (rows.length === 0) return;
    await this.db.messages.bulkPut(rows.map((row) => ({ ...row, archived: true })));
  }
  async appendMemory(m: Memory) { await this.db.memories.put(m); }
  async listMemories(instanceId: string, charId: string): Promise<Memory[]> {
    const rows = await this.db.memories.where("[instanceId+charId]").equals([instanceId, charId]).toArray();
    const repaired = await this.repairLegacyMemories(instanceId, charId);
    return this.sortMemories([...rows.filter((row) => this.isActive(row)), ...repaired]);
  }
  async listAllMemories(instanceId: string): Promise<Memory[]> {
    const rows = await this.db.memories.where("instanceId").equals(instanceId).toArray();
    const repaired = await this.repairLegacyMemories(instanceId);
    return this.sortMemories([...rows.filter((row) => this.isActive(row)), ...repaired]);
  }
  async listAuditMemories(instanceId: string): Promise<Memory[]> {
    const rows = await this.db.memories.where("instanceId").equals(instanceId).toArray();
    const repaired = await this.repairLegacyMemories(instanceId);
    const legacy = await this.ambiguousLegacyMemories();
    return this.sortMemories([...legacy, ...rows, ...repaired]);
  }
  async deleteMemories(ids: string[]) {
    if (ids.length === 0) return;
    const rows = (await this.db.memories.bulkGet(ids)).filter((row): row is Memory => !!row);
    if (rows.length === 0) return;
    await this.db.memories.bulkPut(rows.map((row) => ({ ...row, archived: true })));
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
    return rows.filter((row) => this.isActive(row)).sort((a, b) => a.at - b.at);
  }
  async listAuditDeltaLog(instanceId: string): Promise<DeltaLogEntry[]> {
    const rows = await this.db.deltaLog.where("instanceId").equals(instanceId).toArray();
    return rows.sort((a, b) => a.at - b.at);
  }
  async deleteDeltaLog(ids: string[]) {
    if (ids.length === 0) return;
    const rows = (await this.db.deltaLog.bulkGet(ids)).filter((row): row is DeltaLogEntry => !!row);
    if (rows.length === 0) return;
    await this.db.deltaLog.bulkPut(rows.map((row) => ({ ...row, archived: true })));
  }
  async getTimelineBranch(id: string) { return this.db.timelineBranches.get(id); }
  async listTimelineBranches(instanceId: string): Promise<TimelineBranch[]> {
    const rows = await this.db.timelineBranches.where("instanceId").equals(instanceId).toArray();
    return rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }
  async upsertTimelineBranch(branch: TimelineBranch) { await this.db.timelineBranches.put(branch); }
}
