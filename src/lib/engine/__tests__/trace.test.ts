import { describe, it, expect, beforeEach } from "vitest";
import { TraceCollector, emitTrace, recentTraces, subscribeTrace, clearTraces } from "../trace";
import { commit, type GateCtx } from "../write-gate";
import { runTurn } from "../turn";
import { DEMO_SEED } from "../../world/seed-demo";
import { instantiate } from "../../world/instance";
import { getRepository, resetRepository } from "../../storage";
import type { WorldState, WorldRules, ChatMessage } from "../../types";

const rules: WorldRules = { physics: "无超自然", setting: "现代酒馆", redLines: [] };

function baseState(): WorldState {
  return {
    currentLocationId: "bar",
    time: { day: 1, clock: "夜", lighting: "暗" },
    locations: { bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: [], presentCharacterIds: [], objectIds: ["glass"] } },
    objects: { glass: { id: "glass", name: "酒杯", detail: "fleshed", props: {}, locationId: "bar", state: "空" } },
    roster: {},
    flags: {},
  };
}

describe("TraceCollector (§4.7)", () => {
  it("captures casting, commits, rejections, and fired threads", () => {
    const t = new TraceCollector("w1", 2);
    t.setCasting({ active: ["c-lan"], ambient: ["c-zhou"] });
    t.recordCommit("reactor", { kind: "setObjectState", objectId: "glass", state: "满" });
    t.recordCommit("offscreen", { kind: "openThread", id: "th1", summary: "x" });
    t.recordRejection("user", { kind: "setObjectState", objectId: "ghost", state: "x" }, "对象 ghost 不存在");
    const trace = t.finish();
    expect(trace.casting).toEqual({ active: ["c-lan"], ambient: ["c-zhou"] });
    expect(trace.committed.map((c) => c.kind)).toEqual(["setObjectState", "openThread"]);
    expect(trace.rejected[0]).toMatchObject({ source: "user", kind: "setObjectState", reason: "对象 ghost 不存在" });
    expect(trace.threadsFired).toEqual(["th1"]);
    expect(trace.outcome).toBe("completed");
  });
});

describe("inspector channel (§4.7)", () => {
  beforeEach(() => clearTraces());

  it("buffers emitted traces and notifies subscribers", () => {
    const seen: string[] = [];
    const unsub = subscribeTrace((t) => seen.push(t.instanceId));
    emitTrace(new TraceCollector("a", 1).finish());
    emitTrace(new TraceCollector("b", 1).finish());
    unsub();
    emitTrace(new TraceCollector("c", 1).finish());
    expect(seen).toEqual(["a", "b"]); // unsubscribed before c
    expect(recentTraces().map((t) => t.instanceId)).toEqual(["a", "b", "c"]);
  });
});

describe("WriteGate records into a trace (§4.7)", () => {
  it("a passed trace receives both commits and rejections", async () => {
    const t = new TraceCollector("w1", 1);
    const ctx: GateCtx = {
      state: baseState(), rules, instanceId: "w1", turn: 1,
      repo: { appendDeltaLog: async () => {} }, logger: () => {}, now: () => 1, trace: t,
    };
    await commit(ctx, [
      { delta: { kind: "setObjectState", objectId: "glass", state: "满" }, source: "reactor", cause: "c" },
      { delta: { kind: "setObjectState", objectId: "ghost", state: "x" }, source: "reactor", cause: "c" },
    ]);
    const trace = t.finish();
    expect(trace.committed).toHaveLength(1);
    expect(trace.rejected).toHaveLength(1);
  });
});

describe("runTurn emits a trace (§4.7 integration)", () => {
  beforeEach(() => { resetRepository(); indexedDB.deleteDatabase("anywhere-door"); clearTraces(); });

  it("emits a completed trace with the casting decision after a turn", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-trace"));
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) return { content: "[]" };
      if (sys.includes("世界环境作家")) return { content: "x" };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "……" };
    };
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-trace", input: "我进来。", llm });

    const traces = recentTraces().filter((t) => t.instanceId === "w-trace");
    expect(traces.length).toBe(1);
    expect(traces[0].outcome).toBe("completed");
    expect(traces[0].casting).not.toBeNull();
    expect(traces[0].casting!.active).toContain("c-lan");
  });
});
