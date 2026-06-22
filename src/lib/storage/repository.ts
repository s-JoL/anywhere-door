import type { WorldInstance, Message, Memory } from "../types";

export interface Repository {
  getInstance(id: string): Promise<WorldInstance | undefined>;
  upsertInstance(i: WorldInstance): Promise<void>;
  listMessages(instanceId: string): Promise<Message[]>;
  appendMessage(m: Message): Promise<void>;
  appendMemory(m: Memory): Promise<void>;
  listMemories(charId: string): Promise<Memory[]>;
}
