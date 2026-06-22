import { describe, it, expect, beforeEach } from "vitest";
import { runTurn } from "../turn";
import { DEMO_SEED } from "../../world/seed-demo";
import { instantiate } from "../../world/instance";
import { getRepository, resetRepository } from "../../storage";

describe("runTurn (skeleton)", () => {
  beforeEach(() => { resetRepository(); indexedDB.deleteDatabase("the-reveries"); });

  it("records witness-scoped observations and feeds the speaker its own memories", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w1");
    await repo.upsertInstance(inst);

    // 预置一条 阿岚 的旧记忆，验证会被检索注入
    await repo.appendMemory({ id: "m0", charId: "c-lan", kind: "observation", text: "你：上次你赊的账还没结", keywords: ["账","赊","结"], importance: 6, createdAt: 0, lastAccessed: 0 });

    let sawPrompt: any[] = [];
    const llm = async (messages: any[]) => { sawPrompt = messages; return { content: "（阿岚瞥了你一眼）又来赊账？" }; };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w1", input: "我想赊一杯酒。", deltas: [{ kind: "setObjectState", objectId: "o-glass", state: "被推到吧台另一侧" }], llm });

    // 发言者(阿岚)的 prompt 注入了她自己的记忆
    expect(JSON.stringify(sawPrompt)).toContain("上次你赊的账还没结");

    // 回合后，在场二人（阿岚、老周）都获得了关于这轮的观察记忆
    const lanMems = await repo.listMemories("c-lan");
    const zhouMems = await repo.listMemories("c-zhou");
    expect(lanMems.some((m) => m.text.includes("赊一杯酒"))).toBe(true);
    expect(zhouMems.some((m) => m.text.includes("赊一杯酒"))).toBe(true);

    const after = await repo.getInstance("w1");
    expect(after?.state.objects["o-glass"].state).toBe("被推到吧台另一侧"); // 回合级 valid-delta 集成覆盖
  });

  it("does NOT leak the scene's events into an absent character's memory (subjective isolation)", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w2");
    // 把老周移到后巷：让 bar 只剩阿岚在场（构造一个不在场的角色）
    inst.state.locations.bar.presentCharacterIds = ["c-lan"];
    inst.state.locations.alley = { id: "alley", name: "后巷", detail: "stub", gist: "湿冷的后巷", connections: ["bar"], presentCharacterIds: ["c-zhou"], objectIds: [] };
    inst.state.locations.bar.connections = ["alley"];
    await repo.upsertInstance(inst);

    const llm = async () => ({ content: "（压低声音）这事别让外人知道。" });
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w2", input: "我悄悄告诉你一个秘密：金库密码是 4719。", llm });

    const zhouMems = await repo.listMemories("c-zhou"); // 老周在后巷，不在场
    expect(zhouMems.some((m) => m.text.includes("4719"))).toBe(false); // 秘密没泄漏给不在场者
    const lanMems = await repo.listMemories("c-lan");   // 阿岚在场
    expect(lanMems.some((m) => m.text.includes("4719"))).toBe(true);
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
