import { describe, it, expect, beforeEach } from "vitest";
import { runTurn } from "../turn";
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

describe("runTurn (multi-speaker free-speech)", () => {
  beforeEach(() => { resetRepository(); indexedDB.deleteDatabase("the-reveries"); });

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
});
