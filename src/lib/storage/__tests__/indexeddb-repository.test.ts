import { describe, it, expect, beforeEach } from "vitest";
import { getRepository, resetRepository } from "../index";
import type { WorldInstance, Message, Memory } from "../../types";

function inst(id: string): WorldInstance {
  return {
    id, seedId: "seed-1", createdAt: 1, updatedAt: 1,
    state: { currentLocationId: "bar", time: { day: 1, clock: "黄昏", lighting: "暖" }, locations: {}, objects: {}, roster: {}, flags: {} },
  };
}

function memory(id: string, instanceId: string | undefined, charId = "c1"): Memory {
  return {
    id,
    ...(instanceId ? { instanceId } : {}),
    charId,
    kind: "observation",
    text: id,
    keywords: [id],
    importance: 5,
    createdAt: 1,
    lastAccessed: 1,
  } as Memory;
}

describe("IndexedDbRepository", () => {
  beforeEach(async () => {
    // Reset the singleton and delete the database to isolate each test case.
    resetRepository();
    indexedDB.deleteDatabase("anywhere-door");
  });

  it("upserts and gets an instance", async () => {
    const repo = getRepository();
    await repo.upsertInstance(inst("w1"));
    const got = await repo.getInstance("w1");
    expect(got?.seedId).toBe("seed-1");
  });

  it("appends and lists messages in createdAt order", async () => {
    const repo = getRepository();
    const m = (id: string, t: number): Message => ({ id, instanceId: "w1", role: "user", speakerId: null, content: id, createdAt: t });
    await repo.appendMessage(m("b", 2));
    await repo.appendMessage(m("a", 1));
    const list = await repo.listMessages("w1");
    expect(list.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("appends and lists the per-instance delta log in append order, filtered by instance", async () => {
    const repo = getRepository();
    const e = (id: string, instanceId: string, turn: number, at: number) => ({
      id, instanceId, turn, source: "reactor" as const, cause: "我推门进来",
      gameDay: 1, gameClock: "黄昏", at,
      delta: { kind: "setObjectState" as const, objectId: "o1", state: "打翻" },
    });
    await repo.appendDeltaLog(e("d2", "w1", 1, 2));
    await repo.appendDeltaLog(e("d1", "w1", 1, 1));
    await repo.appendDeltaLog(e("d3", "w2", 1, 3)); // other instance
    const log = await repo.listDeltaLog("w1");
    expect(log.map((x) => x.id)).toEqual(["d1", "d2"]); // ascending by at, only w1
    expect(log[0].delta).toEqual({ kind: "setObjectState", objectId: "o1", state: "打翻" });
  });

  it("deletes delta log entries by id", async () => {
    const repo = getRepository();
    const e = (id: string, at: number) => ({
      id, instanceId: "w1", turn: 1, source: "reactor" as const, cause: "我推门进来",
      gameDay: 1, gameClock: "黄昏", at,
      delta: { kind: "setObjectState" as const, objectId: "o1", state: id },
    });
    await repo.appendDeltaLog(e("d1", 1));
    await repo.appendDeltaLog(e("d2", 2));

    await repo.deleteDeltaLog(["d1"]);

    const log = await repo.listDeltaLog("w1");
    expect(log.map((x) => x.id)).toEqual(["d2"]);
    const auditLog = await repo.listAuditDeltaLog("w1");
    expect(auditLog.map((x) => x.id)).toEqual(["d1", "d2"]);
    expect(auditLog.find((x) => x.id === "d1")?.archived).toBe(true);
  });

  it("keeps archived messages out of the active view but visible in audit", async () => {
    const repo = getRepository();
    const m = (id: string, t: number): Message => ({ id, instanceId: "w1", role: "user", speakerId: null, content: id, createdAt: t });
    await repo.appendMessage(m("m1", 1));
    await repo.appendMessage(m("m2", 2));

    await repo.deleteMessages(["m1"]);

    expect((await repo.listMessages("w1")).map((x) => x.id)).toEqual(["m2"]);
    const audit = await repo.listAuditMessages("w1");
    expect(audit.map((x) => x.id)).toEqual(["m1", "m2"]);
    expect(audit.find((x) => x.id === "m1")?.archived).toBe(true);
  });

  it("stores timeline branches sorted by update time and filtered by instance", async () => {
    const repo = getRepository();
    const branch = (id: string, instanceId: string, updatedAt: number) => ({
      id,
      instanceId,
      seedId: "seed-1",
      title: id,
      createdAt: updatedAt - 1,
      updatedAt,
      forkedFromTurn: 1,
      snapshot: {
        state: inst(instanceId).state,
        messages: [],
        memories: [],
        deltaLog: [],
        turn: 1,
      },
    });

    await repo.upsertTimelineBranch(branch("b1", "w1", 10));
    await repo.upsertTimelineBranch(branch("b2", "w1", 20));
    await repo.upsertTimelineBranch(branch("b3", "w2", 30));

    const branches = await repo.listTimelineBranches("w1");
    expect(branches.map((b) => b.id)).toEqual(["b2", "b1"]);
    await expect(repo.getTimelineBranch("b1")).resolves.toMatchObject({ id: "b1", instanceId: "w1" });
  });

  it("keeps ambiguous legacy memories out of active reads but visible in audit for multi-instance upgrades", async () => {
    const repo = getRepository();
    await repo.upsertInstance(inst("w1"));
    await repo.upsertInstance(inst("w2"));
    await repo.appendMemory(memory("legacy-without-instance", undefined));
    await repo.appendMemory(memory("current-w1", "w1"));

    expect((await repo.listAllMemories("w1")).map((m) => m.id)).toEqual(["current-w1"]);
    expect((await repo.listAuditMemories("w1")).map((m) => m.id)).toEqual(["legacy-without-instance", "current-w1"]);
  });
});
