import { describe, it, expect, beforeEach } from "vitest";
import { runTurn } from "../turn";
import { DEMO_SEED } from "../../world/seed-demo";
import { instantiate } from "../../world/instance";
import { getRepository, resetRepository } from "../../storage";
import type { ChatMessage } from "../../types";

describe("runTurn (skeleton)", () => {
  beforeEach(() => { resetRepository(); indexedDB.deleteDatabase("the-reveries"); });

  it("appends the user message, applies a valid delta, and persists one character reply", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w1");
    await repo.upsertInstance(inst);

    const seen: ChatMessage[][] = [];
    const llm = async (messages: ChatMessage[]) => { seen.push(messages); return { content: "（阿岚抬眼）……找谁？" }; };

    await runTurn({
      seed: DEMO_SEED, repo, instanceId: "w1",
      input: "我推门走进酒馆，抖了抖伞上的雨。",
      deltas: [{ kind: "setObjectState", objectId: "o-glass", state: "被推到一边" }],
      llm,
    });

    const msgs = await repo.listMessages("w1");
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[1].speakerId).toBe("c-lan");
    expect(msgs[1].content).toContain("找谁");

    const after = await repo.getInstance("w1");
    expect(after?.state.objects["o-glass"].state).toBe("被推到一边"); // delta 已落库
    expect(seen[0][0].role).toBe("system"); // 角色用主观 prompt 生成
  });

  it("rejects an invalid delta without crashing the turn", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w2"));
    await runTurn({
      seed: DEMO_SEED, repo, instanceId: "w2", input: "嗯。",
      deltas: [{ kind: "setObjectState", objectId: "ghost", state: "x" }],
      llm: async () => ({ content: "……" }),
    });
    const after = await repo.getInstance("w2");
    expect(after?.state.objects["ghost"]).toBeUndefined(); // 非法 delta 被丢弃
  });
});
