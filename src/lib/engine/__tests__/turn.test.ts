import { describe, it, expect, beforeEach } from "vitest";
import { regenerateLastTurn, runTurn } from "../turn";
import type { TurnEvent } from "../turn";
import { DEMO_SEED } from "../../world/seed-demo";
import { instantiate } from "../../world/instance";
import { getRepository, resetRepository } from "../../storage";
import type { ChatMessage } from "../../types";

// fake llm：判断请求（含"暂停扮演"）→ 返回 speak JSON；否则 → 返回该角色一句台词
function makeLlm(line: (sys: string) => string) {
  return async (messages: ChatMessage[]) => {
    const last = messages[messages.length - 1]?.content ?? "";
    if (last.includes("暂停扮演")) return { content: '{"action":"speak","eagerness":0.8}' };
    const sys = messages[0]?.content ?? "";
    return { content: line(sys) };
  };
}

// streaming fake llm：判断请求 → speak JSON；生成请求 → 调用 onContent 回调后返回内容
function makeStreamingLlm() {
  return async (messages: ChatMessage[], onContent?: (delta: string) => void) => {
    const last = messages[messages.length - 1]?.content ?? "";
    if (last.includes("暂停扮演")) return { content: '{"action":"speak","eagerness":0.8}' };
    // 生成请求：模拟流式输出两个片段
    onContent?.("片");
    onContent?.("段");
    return { content: "片段" };
  };
}

describe("runTurn (multi-speaker free-speech)", () => {
  beforeEach(() => { resetRepository(); indexedDB.deleteDatabase("anywhere-door"); });

  it("lets present characters speak autonomously and records witness-scoped observations", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w1"));
    // 两人都想说 → 一轮最多 2 人（DEFAULT maxSpeakersPerRound=2）
    const llm = makeLlm((sys) => sys.includes("阿岚") ? "（阿岚擦着杯子）又是你。" : "（老周抬眼）来得正好。");
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w1", input: "我推门进来。", llm });

    const msgs = await repo.listMessages("w1");
    const speakers = msgs.filter((m) => m.role === "assistant").map((m) => m.speakerId);
    expect(speakers).toContain("c-lan");
    expect(speakers).toContain("c-zhou");
    // 在场双方都获得了观察（含彼此的话）
    const lan = await repo.listMemories("c-lan");
    expect(lan.some((m) => m.text.includes("推门进来"))).toBe(true);
  });

  it("applies a valid delta and rejects an invalid one without crashing", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w2"));
    const llm = makeLlm(() => "……");
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w2", input: "嗯。",
      deltas: [{ kind: "setObjectState", objectId: "o-glass", state: "满" }, { kind: "setObjectState", objectId: "ghost", state: "x" }], llm });
    const after = await repo.getInstance("w2");
    expect(after?.state.objects["o-glass"].state).toBe("满"); // valid 应用
    expect(after?.state.objects["ghost"]).toBeUndefined();    // invalid 丢弃
  });

  it("reactor commits object state and player condition changes", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-reactor"));

    // Fake LLM: detect reactor prompt by "世界状态记录器" in system message
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) {
        return { content: '[{"kind":"setObjectState","objectId":"o-glass","state":"打翻在吧台上"},{"kind":"setCondition","entityId":"you","condition":"浑身湿透"}]' };
      }
      if (last.includes("暂停扮演")) return { content: '{"action":"speak","eagerness":0.8}' };
      return { content: "……" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-reactor", input: "我把杯子碰翻了。", llm });

    const after = await repo.getInstance("w-reactor");
    expect(after?.state.objects["o-glass"]?.state).toBe("打翻在吧台上");
    expect(after?.state.roster["you"]?.condition).toBe("浑身湿透");
  });

  it("walkable space: reactor establishLocation + moveScene + moveCharacter updates state end-to-end", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-walk"));

    // Fake LLM: reactor prompt → 3 deltas (establish 里屋, move scene, bring 阿岚)
    // Other prompts → speak JSON or short line
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) {
        return {
          content: '[{"kind":"establishLocation","id":"back","name":"里屋","connectFrom":"bar"},{"kind":"moveScene","toLocationId":"back"},{"kind":"moveCharacter","characterId":"c-lan","toLocationId":"back"}]',
        };
      }
      if (last.includes("暂停扮演")) return { content: '{"action":"speak","eagerness":0.8}' };
      return { content: "……" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-walk", input: "我拽她进里屋。", llm });

    const after = await repo.getInstance("w-walk");
    // New location exists and is bidirectionally connected
    expect(after?.state.locations["back"]).toBeDefined();
    expect(after?.state.locations["back"]?.name).toBe("里屋");
    expect(after?.state.locations["back"]?.connections).toContain("bar");
    expect(after?.state.locations["bar"]?.connections).toContain("back");
    // Scene moved to 里屋
    expect(after?.state.currentLocationId).toBe("back");
    // 阿岚 moved to 里屋
    expect(after?.state.locations["back"]?.presentCharacterIds).toContain("c-lan");
    expect(after?.state.locations["bar"]?.presentCharacterIds).not.toContain("c-lan");
  });

  it("turn applies setRelationship delta", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-social"));

    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) {
        return { content: '[{"kind":"setRelationship","fromId":"c-lan","toId":"you","disposition":"暗生情愫"}]' };
      }
      if (last.includes("暂停扮演")) return { content: '{"action":"speak","eagerness":0.8}' };
      return { content: "……" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-social", input: "我对她微笑。", llm });

    const after = await repo.getInstance("w-social");
    expect(after?.state.relationships?.["c-lan"]?.["you"]?.disposition).toBe("暗生情愫");
  });

  it("emits speaker-start/delta/speaker-end events and persists reply with same id", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w3"));
    const llm = makeStreamingLlm();

    const events: TurnEvent[] = [];
    await runTurn({
      seed: DEMO_SEED, repo, instanceId: "w3", input: "我进来了。", llm,
      onEvent: (e) => events.push(e),
    });

    // 必须有 speaker-start 事件
    const starts = events.filter((e) => e.type === "speaker-start");
    expect(starts.length).toBeGreaterThan(0);

    // 必须有 delta 事件
    const deltas = events.filter((e) => e.type === "delta");
    expect(deltas.length).toBeGreaterThan(0);

    // 必须有 speaker-end 事件，内容为去前缀后的文本
    const ends = events.filter((e) => e.type === "speaker-end");
    expect(ends.length).toBeGreaterThan(0);
    expect(ends[0].content).toBe("片段");

    // speaker-start 和 speaker-end 的 id 对应同一条持久化消息
    const startId = starts[0].id;
    const endId = ends[0].id;
    expect(startId).toBe(endId);

    // 持久化消息存在且 content 正确
    const msgs = await repo.listMessages("w3");
    const persisted = msgs.find((m) => m.id === startId);
    expect(persisted).toBeDefined();
    expect(persisted?.content).toBe("片段");
    expect(persisted?.role).toBe("assistant");
  });

  it("regenerates the last turn by restoring prior state and replacing turn messages and memories", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-regen"));

    const replies = ["第一次回应", "旧回应", "新回应"];
    const objectStates = ["第一次状态", "旧状态", "新状态"];
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) {
        const state = objectStates.shift() ?? "意外状态";
        return { content: `[{"kind":"setObjectState","objectId":"o-glass","state":"${state}"}]` };
      }
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: replies.shift() ?? "意外回应" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-regen", input: "第一句。", llm });
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-regen", input: "我把杯子碰了一下。", llm });

    let msgs = await repo.listMessages("w-regen");
    expect(msgs.some((m) => m.content === "旧回应")).toBe(true);
    let inst = await repo.getInstance("w-regen");
    expect(inst?.state.objects["o-glass"]?.state).toBe("旧状态");

    await regenerateLastTurn({ seed: DEMO_SEED, repo, instanceId: "w-regen", llm });

    msgs = await repo.listMessages("w-regen");
    expect(msgs.filter((m) => m.role === "user").map((m) => m.content)).toEqual(["第一句。", "我把杯子碰了一下。"]);
    expect(msgs.some((m) => m.content === "旧回应")).toBe(false);
    expect(msgs.some((m) => m.content === "新回应")).toBe(true);

    inst = await repo.getInstance("w-regen");
    expect(inst?.state.objects["o-glass"]?.state).toBe("新状态");

    const lanMemories = await repo.listMemories("c-lan");
    expect(lanMemories.some((m) => m.text.includes("旧回应"))).toBe(false);
    expect(lanMemories.some((m) => m.text.includes("新回应"))).toBe(true);
  });

  it("rolls back messages and memories when the turn fails before completion", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-fail"));

    await expect(runTurn({
      seed: DEMO_SEED,
      repo,
      instanceId: "w-fail",
      input: "这句不应该污染世界。",
      llm: async () => { throw new Error("missing api key"); },
    })).rejects.toThrow("missing api key");

    const msgs = await repo.listMessages("w-fail");
    expect(msgs).toEqual([]);
    const memories = await repo.listAllMemories();
    expect(memories).toEqual([]);
    const inst = await repo.getInstance("w-fail");
    expect(inst?.lastTurnSnapshot).toBeUndefined();
    expect(inst?.state.objects["o-glass"]?.state).toBe("空着，杯底一圈水痕");
  });
});
