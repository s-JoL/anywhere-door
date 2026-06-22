import type { WorldInstance, Message, Memory, WorldSeed } from "../types";

export interface Repository {
  getInstance(id: string): Promise<WorldInstance | undefined>;
  upsertInstance(i: WorldInstance): Promise<void>;
  listMessages(instanceId: string): Promise<Message[]>;
  appendMessage(m: Message): Promise<void>;
  appendMemory(m: Memory): Promise<void>;
  listMemories(charId: string): Promise<Memory[]>;
  getSeed(id: string): Promise<WorldSeed | undefined>;
  listSeeds(): Promise<WorldSeed[]>;
  upsertSeed(s: WorldSeed): Promise<void>;
}
