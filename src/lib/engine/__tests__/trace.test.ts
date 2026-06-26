import { describe, it, expect, beforeEach } from "vitest";
import { TraceCollector, emitTrace, recentTraces, subscribeTrace, clearTraces } from "../trace";
import { commit, type GateCtx } from "../write-gate";
import { runTurn } from "../turn";
import { DEMO_SEED } from "../../world/seed-demo";
import { instantiate } from "../../world/instance";
import { getRepository, resetRepository } from "../../storage";
import { buildSelfMemory } from "../../memory/observe";
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
    t.recordGuardRejection({ surface: "director", slips: ["旧仓库"], reason: "off-projection" });
    const trace = t.finish();
    expect(trace.casting).toEqual({ active: ["c-lan"], ambient: ["c-zhou"] });
    expect(trace.committed.map((c) => c.kind)).toEqual(["setObjectState", "openThread"]);
    expect(trace.rejected[0]).toMatchObject({ source: "user", kind: "setObjectState", reason: "对象 ghost 不存在" });
    expect(trace.guardRejections).toEqual([{ surface: "director", slips: ["旧仓库"], reason: "off-projection" }]);
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

  it("emits God Edit commits into the Studio trace", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-trace-god"));

    await runTurn({
      seed: DEMO_SEED,
      repo,
      instanceId: "w-trace-god",
      inputChannel: "god-edit",
      input: JSON.stringify([{ kind: "setObjectState", objectId: "o-glass", state: "盛着一指酒" }]),
      llm: async () => ({ content: "[]" }),
    });

    const trace = recentTraces().find((t) => t.instanceId === "w-trace-god");
    expect(trace?.outcome).toBe("completed");
    expect(trace?.committed).toEqual([{ source: "god", kind: "setObjectState", cause: "" }]);
  });

  it("includes Director Note steering in the emitted casting decision", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-trace-director-cast");
    inst.directorNotes = [{ id: "dn1", text: "让阿梅接住这一幕，不要再沉默。", createdAt: 1 }];
    inst.state = {
      ...inst.state,
      locations: {
        ...inst.state.locations,
        bar: {
          ...inst.state.locations.bar,
          presentCharacterIds: ["c-lan", "c-zhou", "c-a", "c-b", "c-mei"],
        },
      },
      roster: {
        ...inst.state.roster,
        "c-a": { name: "甲客" },
        "c-b": { name: "乙客" },
        "c-mei": { name: "阿梅" },
      },
      characters: {
        "c-a": { id: "c-a", name: "甲客", description: "酒馆里的甲客。" },
        "c-b": { id: "c-b", name: "乙客", description: "酒馆里的乙客。" },
        "c-mei": { id: "c-mei", name: "阿梅", description: "一直站在门边沉默的人。" },
      },
    };
    await repo.upsertInstance(inst);
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) return { content: "[]" };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "……" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-trace-director-cast", input: "我看向门口。", llm });

    const trace = recentTraces().find((t) => t.instanceId === "w-trace-director-cast");
    expect(trace?.casting?.active).toContain("c-mei");
    expect(trace?.casting?.ambient).not.toContain("c-mei");
  });

  it("includes Scene Contract memory steering in the emitted casting decision", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-trace-contract-memory-cast");
    inst.sceneContract = { id: "sc1", text: "本场让银色筹码的保管人进入镜头，但不要直接点破。", createdAt: 1 };
    inst.state = {
      ...inst.state,
      locations: {
        ...inst.state.locations,
        bar: {
          ...inst.state.locations.bar,
          presentCharacterIds: ["c-lan", "c-zhou", "c-a", "c-b", "c-mei"],
        },
      },
      roster: {
        ...inst.state.roster,
        "c-a": { name: "甲客" },
        "c-b": { name: "乙客" },
        "c-mei": { name: "阿梅" },
      },
      characters: {
        "c-a": { id: "c-a", name: "甲客", description: "酒馆里的甲客。" },
        "c-b": { id: "c-b", name: "乙客", description: "酒馆里的乙客。" },
        "c-mei": { id: "c-mei", name: "阿梅", description: "一直站在门边沉默的人。" },
      },
    };
    await repo.upsertInstance(inst);
    await repo.appendMemory(buildSelfMemory("w-trace-contract-memory-cast", "c-mei", "你曾把银色筹码交给阿梅保管。", 9));
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) return { content: "[]" };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "……" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-trace-contract-memory-cast", input: "我环顾酒馆。", llm });

    const trace = recentTraces().find((t) => t.instanceId === "w-trace-contract-memory-cast");
    expect(trace?.casting?.active).toContain("c-mei");
    expect(trace?.casting?.ambient).not.toContain("c-mei");
  });

  it("includes character memory relevance in the emitted casting decision", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-trace-memory-cast");
    inst.state = {
      ...inst.state,
      locations: {
        ...inst.state.locations,
        bar: {
          ...inst.state.locations.bar,
          presentCharacterIds: ["c-lan", "c-zhou", "c-a", "c-b", "c-mei"],
        },
      },
      roster: {
        ...inst.state.roster,
        "c-a": { name: "甲客" },
        "c-b": { name: "乙客" },
        "c-mei": { name: "阿梅" },
      },
      characters: {
        "c-a": { id: "c-a", name: "甲客", description: "酒馆里的甲客。" },
        "c-b": { id: "c-b", name: "乙客", description: "酒馆里的乙客。" },
        "c-mei": { id: "c-mei", name: "阿梅", description: "一直站在门边沉默的人。" },
      },
    };
    await repo.upsertInstance(inst);
    await repo.appendMemory(buildSelfMemory("w-trace-memory-cast", "c-mei", "你曾把银色筹码交给阿梅保管。", 9));
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) return { content: "[]" };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "……" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-trace-memory-cast", input: "我把银色筹码放在吧台上。", llm });

    const trace = recentTraces().find((t) => t.instanceId === "w-trace-memory-cast");
    expect(trace?.casting?.active).toContain("c-mei");
    expect(trace?.casting?.ambient).not.toContain("c-mei");
  });
});
