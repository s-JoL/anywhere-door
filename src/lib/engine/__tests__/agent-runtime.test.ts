import { describe, it, expect, beforeEach } from "vitest";
import { runActiveAgents } from "../agent-runtime";
import { DEMO_SEED } from "../../world/seed-demo";
import { instantiate } from "../../world/instance";
import { getRepository, resetRepository } from "../../storage";
import { DEFAULT_ENGINE_CONFIG } from "../config";
import { presentCharacters } from "../prompt";
import { TraceCollector } from "../trace";
import { buildSelfMemory } from "../../memory/observe";
import { keywordsOf } from "../../memory/keywords";
import type { TurnEvent } from "../turn";
import type { ChatMessage, Memory, WorldState } from "../../types";

// Always-speak fake llm (intent → speak JSON; generation → a line).
const speakLlm = async (messages: ChatMessage[]) => {
  const last = messages[messages.length - 1]?.content ?? "";
  if (last.includes("暂停扮演")) return { content: '{"action":"speak","eagerness":0.8}' };
  return { content: "……" };
};

function scriptedSpeaker(line: string) {
  return async (messages: ChatMessage[], onContent?: (delta: string) => void) => {
    const last = messages[messages.length - 1]?.content ?? "";
    if (last.includes("暂停扮演")) return { content: '{"action":"speak","eagerness":0.8}' };
    onContent?.(line);
    return { content: line };
  };
}

function addFarWarehouse(state: WorldState) {
  state.locations.warehouse = {
    id: "warehouse",
    name: "旧仓库",
    detail: "stub",
    gist: "很远的废弃仓库",
    connections: [],
    presentCharacterIds: [],
    objectIds: [],
  };
}

function observation(charId: string, id: string, text: string, createdAt: number, importance = 5): Memory {
  return {
    id,
    instanceId: "w-test",
    charId,
    kind: "observation",
    text,
    keywords: keywordsOf(text),
    importance,
    createdAt,
    lastAccessed: createdAt,
    provenance: "witnessed",
    confidence: 1,
    perceptionQuality: "full",
  };
}

describe("runActiveAgents (§4.4 AgentRuntime)", () => {
  beforeEach(() => { resetRepository(); indexedDB.deleteDatabase("anywhere-door"); });

  it("runs only the active cast: an ambient character never speaks or is queried", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-active"));
    const state = (await repo.getInstance("w-active"))!.state;
    // c-lan active, c-zhou ambient (both present in the bar)
    const activeChars = presentCharacters(DEMO_SEED, state).filter((c) => c.id === "c-lan");

    const { speakerIds } = await runActiveAgents({
      seed: DEMO_SEED, state, repo, instanceId: "w-active", input: "我推门进来。",
      llm: speakLlm, activeChars, config: DEFAULT_ENGINE_CONFIG,
    });

    expect(speakerIds).toEqual(["c-lan"]);
    const msgs = await repo.listMessages("w-active");
    const speakers = msgs.filter((m) => m.role === "assistant").map((m) => m.speakerId);
    expect(speakers.length).toBeGreaterThan(0);
    expect(speakers.every((s) => s === "c-lan")).toBe(true); // ambient c-zhou never spoke
  });

  it("characters only emit prose — runActiveAgents never mutates world state", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-nostate"));
    const state = (await repo.getInstance("w-nostate"))!.state;
    const before = JSON.parse(JSON.stringify(state));
    const activeChars = presentCharacters(DEMO_SEED, state);

    await runActiveAgents({
      seed: DEMO_SEED, state, repo, instanceId: "w-nostate", input: "我看着他们。",
      llm: speakLlm, activeChars, config: DEFAULT_ENGINE_CONFIG,
    });

    expect(state).toEqual(before); // the passed-in state object is untouched
  });

  it("respects the per-turn speak budget (maxConsecutiveAiTurns)", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-budget"));
    const state = (await repo.getInstance("w-budget"))!.state;
    const activeChars = presentCharacters(DEMO_SEED, state);

    const { speakerIds } = await runActiveAgents({
      seed: DEMO_SEED, state, repo, instanceId: "w-budget", input: "说话。",
      llm: speakLlm, activeChars, config: { ...DEFAULT_ENGINE_CONFIG, maxConsecutiveAiTurns: 2 },
    });

    const msgs = await repo.listMessages("w-budget");
    const replies = msgs.filter((m) => m.role === "assistant");
    expect(replies.length).toBeLessThanOrEqual(2);
    expect(speakerIds.length).toBeGreaterThan(0);
  });

  it("drops a character reply that names an unsupported off-projection place", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-guard-drop"));
    const state = (await repo.getInstance("w-guard-drop"))!.state;
    addFarWarehouse(state);
    const activeChars = presentCharacters(DEMO_SEED, state).filter((c) => c.id === "c-lan");
    const events: TurnEvent[] = [];

    const { speakerIds } = await runActiveAgents({
      seed: DEMO_SEED,
      state,
      repo,
      instanceId: "w-guard-drop",
      input: "你看着阿岚。",
      llm: scriptedSpeaker("旧仓库里有人刚刚点亮了灯。"),
      activeChars,
      config: { ...DEFAULT_ENGINE_CONFIG, maxConsecutiveAiTurns: 1, maxSpeakersPerRound: 1 },
      onEvent: (event) => events.push(event),
    });

    expect(speakerIds).toEqual([]);
    expect((await repo.listMessages("w-guard-drop")).filter((m) => m.role === "assistant")).toEqual([]);
    expect((await repo.listMemories("w-guard-drop", "c-lan")).some((m) => m.text.includes("旧仓库"))).toBe(false);
    expect(events.some((event) => event.type === "delta" && event.text.includes("旧仓库"))).toBe(false);
  });

  it("records projection-guard rejections into the trace", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-guard-trace"));
    const state = (await repo.getInstance("w-guard-trace"))!.state;
    addFarWarehouse(state);
    const activeChars = presentCharacters(DEMO_SEED, state).filter((c) => c.id === "c-lan");
    const trace = new TraceCollector("w-guard-trace", 1);

    await runActiveAgents({
      seed: DEMO_SEED,
      state,
      repo,
      instanceId: "w-guard-trace",
      input: "你看着阿岚。",
      llm: scriptedSpeaker("旧仓库里有人刚刚点亮了灯。"),
      activeChars,
      config: { ...DEFAULT_ENGINE_CONFIG, maxConsecutiveAiTurns: 1, maxSpeakersPerRound: 1 },
      trace,
    });

    expect(trace.finish().guardRejections[0]).toMatchObject({
      surface: "character",
      speakerId: "c-lan",
      slips: ["旧仓库"],
    });
  });

  it("does not spend the turn speak budget on a guard-rejected reply when another active character can speak", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-guard-budget"));
    const state = (await repo.getInstance("w-guard-budget"))!.state;
    addFarWarehouse(state);
    const activeChars = presentCharacters(DEMO_SEED, state);
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (last.includes("暂停扮演")) {
        return { content: sys.includes("阿岚") ? '{"action":"speak","eagerness":0.9}' : '{"action":"speak","eagerness":0.8}' };
      }
      if (sys.includes("阿岚")) return { content: "旧仓库里有人刚刚点亮了灯。" };
      return { content: "我只看见吧台上的雨水。" };
    };

    const { speakerIds } = await runActiveAgents({
      seed: DEMO_SEED,
      state,
      repo,
      instanceId: "w-guard-budget",
      input: "你们看见什么了？",
      llm,
      activeChars,
      config: { ...DEFAULT_ENGINE_CONFIG, maxConsecutiveAiTurns: 1, maxSpeakersPerRound: 1 },
    });

    expect(speakerIds).toEqual(["c-zhou"]);
    const replies = (await repo.listMessages("w-guard-budget")).filter((m) => m.role === "assistant");
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ speakerId: "c-zhou", content: "我只看见吧台上的雨水。" });
  });

  it("retries the next-best forced lull-break candidate after a guard rejection", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-forced-guard-retry"));
    const state = (await repo.getInstance("w-forced-guard-retry"))!.state;
    addFarWarehouse(state);
    const activeChars = presentCharacters(DEMO_SEED, state);
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (last.includes("暂停扮演")) {
        return { content: sys.includes("阿岚") ? '{"action":"pass","eagerness":0.9}' : '{"action":"pass","eagerness":0.8}' };
      }
      if (sys.includes("阿岚")) return { content: "旧仓库里有人刚刚点亮了灯。" };
      return { content: "我只看见吧台上的雨水。" };
    };

    const { speakerIds } = await runActiveAgents({
      seed: DEMO_SEED,
      state,
      repo,
      instanceId: "w-forced-guard-retry",
      input: "这里是不是太安静了？",
      llm,
      activeChars,
      config: { ...DEFAULT_ENGINE_CONFIG, maxConsecutiveAiTurns: 1, maxSpeakersPerRound: 1 },
    });

    expect(speakerIds).toEqual(["c-zhou"]);
    const replies = (await repo.listMessages("w-forced-guard-retry")).filter((m) => m.role === "assistant");
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ speakerId: "c-zhou", content: "我只看见吧台上的雨水。" });
  });

  it("uses a neutral narration fallback when every forced lull-break is guard-rejected", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-forced-guard-fallback"));
    const state = (await repo.getInstance("w-forced-guard-fallback"))!.state;
    addFarWarehouse(state);
    const activeChars = presentCharacters(DEMO_SEED, state).filter((c) => c.id === "c-lan");
    const events: TurnEvent[] = [];
    const llm = async (messages: ChatMessage[]) => {
      const last = messages[messages.length - 1]?.content ?? "";
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.9}' };
      return { content: "旧仓库里有人刚刚点亮了灯。" };
    };

    const { speakerIds } = await runActiveAgents({
      seed: DEMO_SEED,
      state,
      repo,
      instanceId: "w-forced-guard-fallback",
      input: "这里是不是太安静了？",
      llm,
      activeChars,
      config: { ...DEFAULT_ENGINE_CONFIG, maxConsecutiveAiTurns: 1, maxSpeakersPerRound: 1 },
      onEvent: (event) => events.push(event),
    });

    expect(speakerIds).toEqual([]);
    const messages = await repo.listMessages("w-forced-guard-fallback");
    expect(messages.filter((m) => m.role === "assistant")).toEqual([]);
    expect(messages.some((m) => m.narration && m.content.includes("阿岚") && m.content.includes("沉默"))).toBe(true);
    expect(events.some((event) => event.type === "narration" && event.content.includes("沉默"))).toBe(true);
  });

  it("allows a character reply that names an offstage place supported by its own memory", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-guard-allow"));
    const state = (await repo.getInstance("w-guard-allow"))!.state;
    addFarWarehouse(state);
    await repo.appendMemory(buildSelfMemory("w-guard-allow", "c-lan", "阿岚曾经亲眼看见旧仓库的窗后有一盏灯。"));
    const activeChars = presentCharacters(DEMO_SEED, state).filter((c) => c.id === "c-lan");

    const { speakerIds } = await runActiveAgents({
      seed: DEMO_SEED,
      state,
      repo,
      instanceId: "w-guard-allow",
      input: "你看着阿岚。",
      llm: scriptedSpeaker("旧仓库的灯如果又亮了，就说明他们回来了。"),
      activeChars,
      config: { ...DEFAULT_ENGINE_CONFIG, maxConsecutiveAiTurns: 1, maxSpeakersPerRound: 1 },
    });

    expect(speakerIds).toEqual(["c-lan"]);
    const replies = (await repo.listMessages("w-guard-allow")).filter((m) => m.role === "assistant");
    expect(replies).toHaveLength(1);
    expect(replies[0].content).toContain("旧仓库");
  });

  it("passes older relevant witness memories into the intent judge", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-intent-memory"));
    const state = (await repo.getInstance("w-intent-memory"))!.state;
    await repo.appendMemory({ ...observation("c-lan", "mem-key", "你造成的后果：铜钥匙藏在地板下。", 1, 9), instanceId: "w-intent-memory" });
    for (let i = 0; i < 8; i++) {
      await repo.appendMemory({ ...observation("c-lan", `mem-noise-${i}`, `雨声里第 ${i + 1} 次无关闲谈。`, i + 2, 2), instanceId: "w-intent-memory" });
    }
    const activeChars = presentCharacters(DEMO_SEED, state).filter((c) => c.id === "c-lan");
    let intentPrompt = "";
    const llm = async (messages: ChatMessage[]) => {
      const last = messages[messages.length - 1]?.content ?? "";
      if (last.includes("暂停扮演")) {
        intentPrompt = messages.map((m) => m.content).join("\n");
        return { content: '{"action":"pass","eagerness":0.1}' };
      }
      return { content: "……" };
    };

    await runActiveAgents({
      seed: DEMO_SEED,
      state,
      repo,
      instanceId: "w-intent-memory",
      input: "地板下的铜钥匙呢？",
      llm,
      activeChars,
      config: { ...DEFAULT_ENGINE_CONFIG, maxConsecutiveAiTurns: 1, maxSpeakersPerRound: 1 },
    });

    expect(intentPrompt).toContain("铜钥匙藏在地板下");
  });

  it("lets a relevant witness memory break a pass-only lull", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-memory-lull"));
    const state = (await repo.getInstance("w-memory-lull"))!.state;
    await repo.appendMemory({ ...observation("c-lan", "mem-key", "你造成的后果：铜钥匙藏在地板下。", 1, 9), instanceId: "w-memory-lull" });
    await repo.appendMemory({ ...observation("c-zhou", "mem-noise", "老周只记得吧台上有一圈水痕。", 2, 2), instanceId: "w-memory-lull" });
    const byId = new Map(presentCharacters(DEMO_SEED, state).map((c) => [c.id, c]));
    const activeChars = [byId.get("c-zhou")!, byId.get("c-lan")!];
    const llm = async (messages: ChatMessage[], onContent?: (delta: string) => void) => {
      const last = messages[messages.length - 1]?.content ?? "";
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      onContent?.("我记得这件事。");
      return { content: "我记得这件事。" };
    };

    const { speakerIds } = await runActiveAgents({
      seed: DEMO_SEED,
      state,
      repo,
      instanceId: "w-memory-lull",
      input: "地板下的铜钥匙呢？",
      llm,
      activeChars,
      config: { ...DEFAULT_ENGINE_CONFIG, maxConsecutiveAiTurns: 1, maxSpeakersPerRound: 1 },
    });

    expect(speakerIds).toEqual(["c-lan"]);
  });

  it("renders an avoid intent as visible social withdrawal instead of forced speech", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-avoid"));
    const state = (await repo.getInstance("w-avoid"))!.state;
    const activeChars = presentCharacters(DEMO_SEED, state).filter((c) => c.id === "c-lan");
    const events: TurnEvent[] = [];
    const llm = async (messages: ChatMessage[], onContent?: (delta: string) => void) => {
      const last = messages[messages.length - 1]?.content ?? "";
      if (last.includes("暂停扮演")) return { content: '{"action":"avoid","eagerness":0.9}' };
      onContent?.("这句话不应该被生成。");
      return { content: "这句话不应该被生成。" };
    };

    const { speakerIds } = await runActiveAgents({
      seed: DEMO_SEED,
      state,
      repo,
      instanceId: "w-avoid",
      input: "你为什么躲着我？",
      llm,
      activeChars,
      config: { ...DEFAULT_ENGINE_CONFIG, maxConsecutiveAiTurns: 1, maxSpeakersPerRound: 1 },
      onEvent: (event) => events.push(event),
    });

    expect(speakerIds).toEqual([]);
    expect((await repo.listMessages("w-avoid")).filter((m) => m.role === "assistant")).toEqual([]);
    const narrations = (await repo.listMessages("w-avoid")).filter((m) => m.narration).map((m) => m.content);
    expect(narrations.some((line) => line.includes("阿岚") && line.includes("避开"))).toBe(true);
    expect(events.some((event) => event.type === "narration" && event.content.includes("避开"))).toBe(true);
    expect((await repo.listMemories("w-avoid", "c-lan")).some((memory) => memory.text.includes("避开"))).toBe(true);
  });

  it("renders avoidance as visible social signal even when another character speaks", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-mixed-avoid"));
    const state = (await repo.getInstance("w-mixed-avoid"))!.state;
    const activeChars = presentCharacters(DEMO_SEED, state);
    const events: TurnEvent[] = [];
    const llm = async (messages: ChatMessage[], onContent?: (delta: string) => void) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (last.includes("暂停扮演")) {
        return { content: sys.includes("老周") ? '{"action":"avoid","eagerness":0.9}' : '{"action":"speak","eagerness":0.7}' };
      }
      onContent?.("雨还没有停。");
      return { content: "雨还没有停。" };
    };

    const { speakerIds } = await runActiveAgents({
      seed: DEMO_SEED,
      state,
      repo,
      instanceId: "w-mixed-avoid",
      input: "老周，你为什么一直不看我？",
      llm,
      activeChars,
      config: { ...DEFAULT_ENGINE_CONFIG, maxConsecutiveAiTurns: 1, maxSpeakersPerRound: 1 },
      onEvent: (event) => events.push(event),
    });

    expect(speakerIds).toEqual(["c-lan"]);
    const messages = await repo.listMessages("w-mixed-avoid");
    expect(messages.some((m) => m.role === "assistant" && m.speakerId === "c-lan" && m.content.includes("雨还没有停"))).toBe(true);
    expect(messages.some((m) => m.narration && m.content.includes("老周") && m.content.includes("避开"))).toBe(true);
    expect(events.some((event) => event.type === "narration" && event.content.includes("老周") && event.content.includes("避开"))).toBe(true);
    expect((await repo.listMemories("w-mixed-avoid", "c-lan")).some((memory) => memory.text.includes("老周") && memory.text.includes("避开"))).toBe(true);
    expect((await repo.listMemories("w-mixed-avoid", "c-zhou")).some((memory) => memory.text.includes("老周") && memory.text.includes("避开"))).toBe(true);
  });
});
