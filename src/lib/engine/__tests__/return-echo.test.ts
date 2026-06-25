import { describe, it, expect, beforeEach } from "vitest";
import { runTurn } from "../turn";
import { DEMO_SEED } from "../../world/seed-demo";
import { instantiate } from "../../world/instance";
import { getRepository, resetRepository } from "../../storage";
import type { ChatMessage } from "../../types";

const quietLlm = async (messages: ChatMessage[]) => {
  const sys = messages[0]?.content ?? "";
  const last = messages[messages.length - 1]?.content ?? "";
  if (sys.includes("世界状态记录器")) return { content: "[]" };
  if (sys.includes("世界环境作家")) return { content: "x" };
  if (sys.includes("离场演化器")) return { content: "[]" };
  if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
  return { content: "……" };
};

describe("§5.6 return echo (integration)", () => {
  beforeEach(() => { resetRepository(); indexedDB.deleteDatabase("anywhere-door"); });

  it("emits a return-open narration on re-entry after time away when a settlement exists", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-return");
    inst.lastSeenAt = Date.now() - 6 * 3_600_000; // away 6h
    inst.settlement = {
      trace: ["钥匙 的 hidden：在地板下"],
      unresolved: ["老周欠债未清"],
      candidates: ["收账人会再来"],
      bond: { who: "阿岚", stance: "记恨在心" },
      atDay: 1,
    };
    await repo.upsertInstance(inst);

    const events: string[] = [];
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-return", input: "我回来了。", llm: quietLlm, onEvent: (e) => { if (e.type === "narration") events.push(e.content); } });

    const msgs = await repo.listMessages("w-return");
    const echo = msgs.find((m) => m.narration && m.content.includes("收账人会再来"));
    expect(echo).toBeDefined();
    expect(echo!.content).toContain("阿岚对你的态度：记恨在心");
    expect(events.some((c) => c.includes("收账人会再来"))).toBe(true);
  });

  it("does not emit a return echo on a fresh instance (no prior settlement)", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-fresh"));
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-fresh", input: "我进来。", llm: quietLlm });
    const msgs = await repo.listMessages("w-fresh");
    expect(msgs.some((m) => m.narration && m.content.includes("收账人"))).toBe(false);
    // but a settlement is now stored for next time
    expect((await repo.getInstance("w-fresh"))?.settlement).toBeDefined();
  });
});
