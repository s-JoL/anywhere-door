import { describe, it, expect, beforeEach } from "vitest";
import { getRepository, resetRepository } from "../index";
import { AnywhereDoorDB } from "../dexie-db";
import type { Memory, WorldInstance } from "../../types";

function mem(instanceId: string, id: string, charId: string, t: number): Memory {
  return { id, instanceId, charId, kind: "observation", text: id, keywords: [], importance: 5, createdAt: t, lastAccessed: t };
}

function inst(id: string): WorldInstance {
  return {
    id,
    seedId: "seed-1",
    createdAt: 1,
    updatedAt: 1,
    state: { currentLocationId: "bar", time: { day: 1, clock: "黄昏", lighting: "暖" }, locations: {}, objects: {}, roster: {}, flags: {} },
  };
}

describe("memory store", () => {
  beforeEach(() => { resetRepository(); indexedDB.deleteDatabase("anywhere-door"); });

  it("appends and lists memories per character in createdAt order", async () => {
    const repo = getRepository();
    await repo.appendMemory(mem("w1", "b", "c1", 2));
    await repo.appendMemory(mem("w1", "a", "c1", 1));
    await repo.appendMemory(mem("w1", "x", "c2", 1));
    await repo.appendMemory(mem("w2", "foreign", "c1", 1));
    const c1 = await repo.listMemories("w1", "c1");
    expect(c1.map((m) => m.id)).toEqual(["a", "b"]);
    const c2 = await repo.listMemories("w1", "c2");
    expect(c2.map((m) => m.id)).toEqual(["x"]);
    expect((await repo.listAllMemories("w1")).map((m) => m.id)).toEqual(["a", "x", "b"]);
    expect((await repo.listAllMemories("w2")).map((m) => m.id)).toEqual(["foreign"]);
  });

  it("repairs legacy memories without instanceId when there is only one instance", async () => {
    const repo = getRepository();
    await repo.upsertInstance(inst("w-legacy"));
    const db = new AnywhereDoorDB();
    try {
      const legacy = { id: "legacy", charId: "c1", kind: "observation", text: "旧记忆", keywords: [], importance: 5, createdAt: 1, lastAccessed: 1 } as unknown as Memory;
      await db.memories.put(legacy);

      const c1 = await repo.listMemories("w-legacy", "c1");
      expect(c1.map((m) => m.id)).toEqual(["legacy"]);
      expect((await repo.listAllMemories("w-legacy")).map((m) => m.id)).toEqual(["legacy"]);
      expect((await db.memories.get("legacy"))?.instanceId).toBe("w-legacy");
    } finally {
      db.close();
    }
  });

  it("keeps archived memories out of the active view but visible in audit", async () => {
    const repo = getRepository();
    await repo.appendMemory(mem("w1", "a", "c1", 1));
    await repo.appendMemory(mem("w1", "b", "c1", 2));

    await repo.deleteMemories(["a"]);

    expect((await repo.listAllMemories("w1")).map((m) => m.id)).toEqual(["b"]);
    const audit = await repo.listAuditMemories("w1");
    expect(audit.map((m) => m.id)).toEqual(["a", "b"]);
    expect(audit.find((m) => m.id === "a")?.archived).toBe(true);
  });
});
