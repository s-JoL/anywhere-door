import { describe, it, expect, beforeEach } from "vitest";
import { getRepository, resetRepository } from "../index";
import type { Memory } from "../../types";

function mem(id: string, charId: string, t: number): Memory {
  return { id, charId, kind: "observation", text: id, keywords: [], importance: 5, createdAt: t, lastAccessed: t };
}

describe("memory store", () => {
  beforeEach(() => { resetRepository(); indexedDB.deleteDatabase("anywhere-door"); });

  it("appends and lists memories per character in createdAt order", async () => {
    const repo = getRepository();
    await repo.appendMemory(mem("b", "c1", 2));
    await repo.appendMemory(mem("a", "c1", 1));
    await repo.appendMemory(mem("x", "c2", 1));
    const c1 = await repo.listMemories("c1");
    expect(c1.map((m) => m.id)).toEqual(["a", "b"]);
    const c2 = await repo.listMemories("c2");
    expect(c2.map((m) => m.id)).toEqual(["x"]);
  });
});
