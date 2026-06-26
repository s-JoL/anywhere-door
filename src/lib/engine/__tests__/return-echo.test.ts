import { describe, it, expect, beforeEach } from "vitest";
import { emitReturnOpenBeat, markInstanceSeen, reconcileReturnOpenBeat, runTurn } from "../turn";
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

  it("emits the return-open beat as soon as an old door is opened, before the next player input", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-open-return");
    inst.lastSeenAt = Date.now() - 6 * 3_600_000;
    inst.settlement = {
      trace: ["铜钥匙藏在地板下"],
      unresolved: ["老周欠债未清"],
      candidates: ["收账人会再来"],
      atDay: 1,
    };
    await repo.upsertInstance(inst);

    const events: string[] = [];
    const beat = await emitReturnOpenBeat({
      repo,
      instanceId: "w-open-return",
      onEvent: (e) => { if (e.type === "narration") events.push(e.content); },
    });

    const msgs = await repo.listMessages("w-open-return");
    expect(beat?.content).toContain("你留下的痕迹还在：铜钥匙藏在地板下");
    expect(msgs.filter((m) => m.narration && m.content.includes("收账人会再来"))).toHaveLength(1);
    expect(events.some((c) => c.includes("收账人会再来"))).toBe(true);
  });

  it("does not duplicate a return-open beat when the player acts after page re-entry", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-open-then-act");
    inst.lastSeenAt = Date.now() - 6 * 3_600_000;
    inst.settlement = {
      trace: ["铜钥匙藏在地板下"],
      unresolved: ["老周欠债未清"],
      candidates: ["收账人会再来"],
      bond: { who: "阿岚", stance: "记恨在心" },
      atDay: 1,
    };
    await repo.upsertInstance(inst);

    await emitReturnOpenBeat({ repo, instanceId: "w-open-then-act" });
    await emitReturnOpenBeat({ repo, instanceId: "w-open-then-act" });
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-open-then-act", input: "我推门进去。", llm: quietLlm });

    const msgs = await repo.listMessages("w-open-then-act");
    expect(msgs.filter((m) => m.narration && m.content.includes("收账人会再来"))).toHaveLength(1);
    expect((await repo.getInstance("w-open-then-act"))?.lastSeenAt).toBeGreaterThan(Date.now() - 60_000);
  });

  it("lets read-only presence refresh lastSeenAt so an in-page pause is not treated as away", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-read-only-presence");
    inst.lastSeenAt = Date.now() - 6 * 3_600_000;
    inst.settlement = {
      trace: ["铜钥匙藏在地板下"],
      unresolved: [],
      candidates: ["收账人会再来"],
      atDay: 1,
    };
    await repo.upsertInstance(inst);

    await markInstanceSeen({ repo, instanceId: "w-read-only-presence", now: Date.now() });
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-read-only-presence", input: "我终于开口。", llm: quietLlm });

    const msgs = await repo.listMessages("w-read-only-presence");
    expect(msgs.some((m) => m.narration && m.content.includes("收账人会再来"))).toBe(false);
  });

  it("reconciles offstage changes before composing the page-open return echo", async () => {
    const repo = getRepository();
    const previousLastSeenAt = Date.now() - 6 * 3_600_000;
    const inst = instantiate(DEMO_SEED, 1, "w-reconcile-open");
    inst.lastSeenAt = previousLastSeenAt;
    inst.state.pressureLines = [
      {
        id: "debt",
        summary: "老周欠债未清",
        status: "active",
        intensity: 5,
        playerKnown: true,
        nextSign: "旧账还压在柜台底下",
      },
    ];
    inst.settlement = {
      trace: [],
      unresolved: ["老周欠债未清"],
      candidates: ["旧账还压在柜台底下"],
      atDay: 1,
    };
    await repo.upsertInstance(inst);

    const now = Date.now();
    const beat = await reconcileReturnOpenBeat({
      seed: DEMO_SEED,
      repo,
      instanceId: "w-reconcile-open",
      now,
      llm: async (messages) => {
        const sys = messages[0]?.content ?? "";
        if (sys.includes("离场演化器")) {
          return {
            content: JSON.stringify([
              {
                kind: "advanceThread",
                id: "debt",
                intensityDelta: 1,
                nextSign: "柜台后的电话响了三声",
              },
            ]),
          };
        }
        return quietLlm(messages);
      },
    });

    const after = await repo.getInstance("w-reconcile-open");
    const log = await repo.listDeltaLog("w-reconcile-open");
    expect(log.some((entry) => entry.source === "offscreen" && entry.delta.kind === "advanceThread")).toBe(true);
    expect(after?.state.pressureLines?.[0].nextSign).toBe("柜台后的电话响了三声");
    expect(after?.settlement?.candidates[0]).toBe("柜台后的电话响了三声");
    expect(beat?.content).toContain("柜台后的电话响了三声");
    expect(beat?.content).not.toContain("旧账还压在柜台底下");
    expect(after?.lastSeenAt).toBe(now);
    expect(after?.returnEchoedForLastSeenAt).toBe(previousLastSeenAt);
  });

  it("surfaces a player-local sign for committed offscreen entity changes", async () => {
    const repo = getRepository();
    const previousLastSeenAt = Date.now() - 6 * 3_600_000;
    const inst = instantiate(DEMO_SEED, 1, "w-reconcile-entity-sign");
    inst.lastSeenAt = previousLastSeenAt;
    inst.settlement = {
      trace: [],
      unresolved: [],
      candidates: [],
      atDay: 1,
    };
    await repo.upsertInstance(inst);

    const beat = await reconcileReturnOpenBeat({
      seed: DEMO_SEED,
      repo,
      instanceId: "w-reconcile-entity-sign",
      llm: async (messages) => {
        const sys = messages[0]?.content ?? "";
        if (sys.includes("离场演化器")) {
          return {
            content: JSON.stringify([
              {
                kind: "setCondition",
                entityId: "c-lan",
                condition: "疲惫，袖口沾着雨水",
              },
            ]),
          };
        }
        return quietLlm(messages);
      },
    });

    const after = await repo.getInstance("w-reconcile-entity-sign");
    const log = await repo.listDeltaLog("w-reconcile-entity-sign");
    expect(log.some((entry) => entry.source === "offscreen" && entry.delta.kind === "setCondition")).toBe(true);
    expect(after?.state.roster["c-lan"].condition).toBe("疲惫，袖口沾着雨水");
    expect(after?.settlement?.candidates[0]).toBe("阿岚看起来疲惫，袖口沾着雨水");
    expect(beat?.content).toContain("阿岚看起来疲惫，袖口沾着雨水");
  });

  it("emits a return-open narration on re-entry after time away when a settlement exists", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-return");
    inst.lastSeenAt = Date.now() - 6 * 3_600_000; // away 6h
    inst.settlement = {
      trace: ["铜钥匙藏在地板下"],
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
    expect(echo!.content).toContain("你留下的痕迹还在：铜钥匙藏在地板下");
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
