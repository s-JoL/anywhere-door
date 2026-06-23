import { describe, it, expect, beforeEach } from "vitest";
import { getRepository, resetRepository } from "../index";
import type { WorldInstance, Message } from "../../types";

function inst(id: string): WorldInstance {
  return {
    id, seedId: "seed-1", createdAt: 1, updatedAt: 1,
    state: { currentLocationId: "bar", time: { day: 1, clock: "黄昏", lighting: "暖" }, locations: {}, objects: {}, roster: {}, flags: {} },
  };
}

describe("IndexedDbRepository", () => {
  beforeEach(async () => {
    // 重置单例并删除数据库以隔离用例
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
});
