import type { WorldInstance, Message, Memory, WorldSeed, TasteEvent } from "../types";
import type { DeltaLogEntry } from "../world/delta";

export interface Repository {
  getInstance(id: string): Promise<WorldInstance | undefined>;
  listInstances(): Promise<WorldInstance[]>; // all opened worlds, for the Doorway Library
  upsertInstance(i: WorldInstance): Promise<void>;
  listMessages(instanceId: string): Promise<Message[]>;
  appendMessage(m: Message): Promise<void>;
  deleteMessages(ids: string[]): Promise<void>;
  appendMemory(m: Memory): Promise<void>;
  listMemories(charId: string): Promise<Memory[]>;
  listAllMemories(): Promise<Memory[]>;
  deleteMemories(ids: string[]): Promise<void>;
  getSeed(id: string): Promise<WorldSeed | undefined>;
  listSeeds(): Promise<WorldSeed[]>;
  upsertSeed(s: WorldSeed): Promise<void>;
  recordTasteEvent(e: TasteEvent): Promise<void>;
  listTasteEvents(): Promise<TasteEvent[]>;   // ascending by at
  appendDeltaLog(e: DeltaLogEntry): Promise<void>;
  listDeltaLog(instanceId: string): Promise<DeltaLogEntry[]>; // ascending by at
}
