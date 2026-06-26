import { describe, it, expect, beforeEach } from "vitest";
import { forkLastTurn, regenerateLastTurn, restoreTimelineBranch, rewindLastTurn, runTurn } from "../turn";
import type { TurnEvent } from "../turn";
import { DEMO_SEED } from "../../world/seed-demo";
import { instantiate } from "../../world/instance";
import { getRepository, resetRepository } from "../../storage";
import type { Repository } from "../../storage/repository";
import { AnywhereDoorDB } from "../../storage/dexie-db";
import { keywordsOf } from "../../memory/keywords";
import { buildSelfMemory } from "../../memory/observe";
import type { ChatMessage, Memory } from "../../types";

// fake llm: decision request (contains "暂停扮演") → return speak JSON; otherwise → return one line for that character
function makeLlm(line: (sys: string) => string) {
  return async (messages: ChatMessage[]) => {
    const last = messages[messages.length - 1]?.content ?? "";
    if (last.includes("暂停扮演")) return { content: '{"action":"speak","eagerness":0.8}' };
    const sys = messages[0]?.content ?? "";
    return { content: line(sys) };
  };
}

// streaming fake llm: decision request → speak JSON; generation request → call onContent callback then return content
function makeStreamingLlm() {
  return async (messages: ChatMessage[], onContent?: (delta: string) => void) => {
    const last = messages[messages.length - 1]?.content ?? "";
    if (last.includes("暂停扮演")) return { content: '{"action":"speak","eagerness":0.8}' };
    // generation request: simulate streaming two fragments
    onContent?.("片");
    onContent?.("段");
    return { content: "片段" };
  };
}

function testMemory(instanceId: string, id: string, charId: string, text: string): Memory & { instanceId: string } {
  return {
    id,
    instanceId,
    charId,
    kind: "observation",
    text,
    keywords: keywordsOf(text),
    importance: 6,
    createdAt: 1,
    lastAccessed: 1,
    provenance: "witnessed",
    confidence: 1,
    perceptionQuality: "full",
  };
}

describe("runTurn (multi-speaker free-speech)", () => {
  beforeEach(() => { resetRepository(); indexedDB.deleteDatabase("anywhere-door"); });

  it("lets present characters speak autonomously and records witness-scoped observations", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w1"));
    // both want to speak → at most 2 per round (DEFAULT maxSpeakersPerRound=2)
    const llm = makeLlm((sys) => sys.includes("阿岚") ? "（阿岚擦着杯子）又是你。" : "（老周抬眼）来得正好。");
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w1", input: "我推门进来。", llm });

    const msgs = await repo.listMessages("w1");
    const speakers = msgs.filter((m) => m.role === "assistant").map((m) => m.speakerId);
    expect(speakers).toContain("c-lan");
    expect(speakers).toContain("c-zhou");
    // both present parties get an observation (including each other's lines)
    const lan = await repo.listMemories("w1", "c-lan");
    expect(lan.some((m) => m.text.includes("推门进来"))).toBe(true);
  });

  it("applies a valid delta and rejects an invalid one without crashing", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w2"));
    const llm = makeLlm(() => "……");
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w2", input: "嗯。",
      deltas: [{ kind: "setObjectState", objectId: "o-glass", state: "满" }, { kind: "setObjectState", objectId: "ghost", state: "x" }], llm });
    const after = await repo.getInstance("w2");
    expect(after?.state.objects["o-glass"].state).toBe("满"); // valid → applied
    expect(after?.state.objects["ghost"]).toBeUndefined();    // invalid → dropped
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

    // Fake LLM: reactor prompt → 3 deltas (establish 里屋/backroom, move scene, bring 阿岚/c-lan)
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
    // Scene moved to 里屋 (backroom)
    expect(after?.state.currentLocationId).toBe("back");
    // 阿岚 (c-lan) moved to 里屋 (backroom)
    expect(after?.state.locations["back"]?.presentCharacterIds).toContain("c-lan");
    expect(after?.state.locations["bar"]?.presentCharacterIds).not.toContain("c-lan");
  });

  it("commits Director tension and offstage surfacing through the WriteGate", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-director-gate");
    inst.state.tension = 5;
    for (const loc of Object.values(inst.state.locations)) {
      loc.presentCharacterIds = loc.presentCharacterIds.filter((id) => id !== "c-zhou");
    }
    await repo.upsertInstance(inst);

    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) return { content: "[]" };
      if (last.includes("暂停扮演")) return { content: '{"action":"speak","eagerness":0.8}' };
      if (sys.includes("世界环境导演")) return { content: "门外的雨声忽然贴近，屋里所有火苗都矮了一截。" };
      return { content: "血！危险！逃！" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-director-gate", input: "血！危险！逃！", llm });

    const after = await repo.getInstance("w-director-gate");
    expect(after?.state.tension).toBeGreaterThan(5);
    expect(after?.state.locations[after.state.currentLocationId].presentCharacterIds).toContain("c-zhou");

    const log = await repo.listDeltaLog("w-director-gate");
    expect(log).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "director", delta: expect.objectContaining({ kind: "setTension" }) }),
      expect.objectContaining({ source: "director", delta: expect.objectContaining({ kind: "moveCharacter", characterId: "c-zhou" }) }),
    ]));
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

  it("fleshes the current stub location at end of turn (stub→fleshed)", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-flesh");
    const cur = inst.state.currentLocationId;
    inst.state.locations[cur] = { ...inst.state.locations[cur], detail: "stub", description: undefined };
    await repo.upsertInstance(inst);
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界环境作家")) return { content: "霉味与旧木的私室，烛火在穿堂风里乱跳。" };
      if (sys.includes("世界状态记录器")) return { content: "[]" };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "……" };
    };
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-flesh", input: "我打量四周。", llm });
    const after = await repo.getInstance("w-flesh");
    expect(after?.state.locations[cur].detail).toBe("fleshed");
    expect(after?.state.locations[cur].description).toContain("私室");
  });

  it("fleshes a visible stub object when the player pays attention to it", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-flesh-object");
    const cur = inst.state.currentLocationId;
    inst.state.locations[cur] = {
      ...inst.state.locations[cur],
      objectIds: [...inst.state.locations[cur].objectIds, "o-box"],
    };
    inst.state.objects["o-box"] = {
      id: "o-box",
      name: "旧木箱",
      detail: "stub",
      props: { portable: false },
      locationId: cur,
    };
    await repo.upsertInstance(inst);
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界物件作家")) return { content: "箱盖内侧刻着三道新鲜的银色划痕。" };
      if (sys.includes("世界状态记录器")) return { content: "[]" };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "……" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-flesh-object", input: "我仔细端详旧木箱。", inputChannel: "observe", llm });

    const after = await repo.getInstance("w-flesh-object");
    expect(after?.state.objects["o-box"]).toMatchObject({ detail: "fleshed", state: "箱盖内侧刻着三道新鲜的银色划痕。" });
    const log = await repo.listDeltaLog("w-flesh-object");
    expect(log.some((entry) => entry.source === "flesh" && entry.delta.kind === "fleshObject" && entry.delta.objectId === "o-box")).toBe(true);
  });

  it("fleshes a stub object when a committed consequence gives it causal power", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-flesh-causal-object");
    const cur = inst.state.currentLocationId;
    inst.state.locations[cur] = {
      ...inst.state.locations[cur],
      objectIds: [...inst.state.locations[cur].objectIds, "o-box"],
    };
    inst.state.objects["o-box"] = {
      id: "o-box",
      name: "旧木箱",
      detail: "stub",
      props: { portable: false },
      locationId: cur,
    };
    await repo.upsertInstance(inst);
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) return { content: '[{"kind":"setObjectState","objectId":"o-box","state":"箱盖被撞开一条缝"}]' };
      if (sys.includes("世界物件作家")) return { content: "箱盖缝里露出潮湿账册的一角，木刺上还挂着新鲜雨水。" };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "……" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-flesh-causal-object", input: "我后退时撞上身后的东西。", llm });

    const after = await repo.getInstance("w-flesh-causal-object");
    expect(after?.state.objects["o-box"]).toMatchObject({
      detail: "fleshed",
      state: "箱盖缝里露出潮湿账册的一角，木刺上还挂着新鲜雨水。",
    });
    const log = await repo.listDeltaLog("w-flesh-causal-object");
    expect(log.some((entry) => entry.source === "reactor" && entry.delta.kind === "setObjectState" && entry.delta.objectId === "o-box")).toBe(true);
    expect(log.some((entry) => entry.source === "flesh" && entry.delta.kind === "fleshObject" && entry.delta.objectId === "o-box")).toBe(true);
  });

  it("fleshes a stub character when a committed consequence gives them causal power", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-flesh-causal-character");
    inst.state.roster["c-stranger"] = { name: "陌生人" };
    inst.state.characters = {
      ...(inst.state.characters ?? {}),
      "c-stranger": {
        id: "c-stranger",
        name: "陌生人",
        description: "角落里的人。",
        detail: "stub",
      },
    };
    await repo.upsertInstance(inst);
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) {
        return { content: '[{"kind":"setRelationship","fromId":"c-stranger","toId":"you","affinityDelta":-20,"reason":"他认定玩家撞开了账箱"}]' };
      }
      if (sys.includes("世界角色作家")) {
        return { content: '{"description":"债主派来的年轻账房，袖口藏着潮湿账页。","goal":"确认玩家是否碰过账箱"}' };
      }
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "……" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-flesh-causal-character", input: "吧台后传来一声闷响。", llm });

    const after = await repo.getInstance("w-flesh-causal-character");
    expect(after?.state.characters?.["c-stranger"]).toMatchObject({
      detail: "fleshed",
      description: "债主派来的年轻账房，袖口藏着潮湿账页。",
      goal: "确认玩家是否碰过账箱",
    });
    const log = await repo.listDeltaLog("w-flesh-causal-character");
    expect(log.some((entry) => entry.source === "reactor" && entry.delta.kind === "setRelationship" && entry.delta.fromId === "c-stranger")).toBe(true);
    expect(log.some((entry) => entry.source === "flesh" && entry.delta.kind === "fleshCharacter" && entry.delta.characterId === "c-stranger")).toBe(true);
  });

  it("fleshes a present stub character when the player pays attention to them", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-flesh-character");
    const cur = inst.state.currentLocationId;
    inst.state.locations[cur] = {
      ...inst.state.locations[cur],
      presentCharacterIds: [...inst.state.locations[cur].presentCharacterIds, "c-stranger"],
    };
    inst.state.roster["c-stranger"] = { name: "陌生人" };
    inst.state.characters = {
      ...(inst.state.characters ?? {}),
      "c-stranger": {
        id: "c-stranger",
        name: "陌生人",
        description: "角落里的人。",
        detail: "stub",
      },
    };
    await repo.upsertInstance(inst);
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界角色作家")) return { content: '{"description":"城南赌坊的收账人，袖口沾着雨水和淡淡药味。","goal":"确认玩家是否带来了银色筹码"}' };
      if (sys.includes("世界状态记录器")) return { content: "[]" };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "……" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-flesh-character", input: "我看向那个陌生人。", inputChannel: "observe", llm });

    const after = await repo.getInstance("w-flesh-character");
    expect(after?.state.characters?.["c-stranger"]).toMatchObject({
      detail: "fleshed",
      description: "城南赌坊的收账人，袖口沾着雨水和淡淡药味。",
      goal: "确认玩家是否带来了银色筹码",
    });
    const log = await repo.listDeltaLog("w-flesh-character");
    expect(log.some((entry) => entry.source === "flesh" && entry.delta.kind === "fleshCharacter" && entry.delta.characterId === "c-stranger")).toBe(true);
  });

  it("fleshes a present stub character when the Director casts them active", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-flesh-active-character");
    const cur = inst.state.currentLocationId;
    inst.state.locations[cur] = {
      ...inst.state.locations[cur],
      presentCharacterIds: ["c-lan", "c-zhou", "c-a", "c-b", "c-stranger"],
    };
    inst.state.roster = {
      ...inst.state.roster,
      "c-a": { name: "甲客" },
      "c-b": { name: "乙客" },
      "c-stranger": { name: "陌生人" },
    };
    inst.state.characters = {
      ...(inst.state.characters ?? {}),
      "c-a": { id: "c-a", name: "甲客", description: "酒馆里的甲客。", detail: "fleshed" },
      "c-b": { id: "c-b", name: "乙客", description: "酒馆里的乙客。", detail: "fleshed" },
      "c-stranger": {
        id: "c-stranger",
        name: "陌生人",
        description: "角落里的人。",
        detail: "stub",
      },
    };
    inst.state.pressureLines = [
      {
        id: "debt",
        summary: "一个欠债旧线索逼近吧台",
        status: "active",
        intensity: 9,
        relatedCharacterIds: ["c-stranger"],
        playerKnown: true,
      },
    ];
    await repo.upsertInstance(inst);
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界角色作家")) return { content: '{"description":"债主派来的年轻账房，指尖一直按着袖口里的纸条。","goal":"等合适时机确认玩家是否认得旧账暗号"}' };
      if (sys.includes("世界状态记录器")) return { content: "[]" };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "……" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-flesh-active-character", input: "我在吧台边坐下。", llm });

    const after = await repo.getInstance("w-flesh-active-character");
    expect(after?.state.characters?.["c-stranger"]).toMatchObject({
      detail: "fleshed",
      description: "债主派来的年轻账房，指尖一直按着袖口里的纸条。",
      goal: "等合适时机确认玩家是否认得旧账暗号",
    });
    const log = await repo.listDeltaLog("w-flesh-active-character");
    expect(log.some((entry) => entry.source === "flesh" && entry.delta.kind === "fleshCharacter" && entry.delta.characterId === "c-stranger")).toBe(true);
  });

  it("writes a setRelationship's reason into the fromId character's memory (evidence → memory)", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-evi"));
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) return { content: '[{"kind":"setRelationship","fromId":"c-lan","toId":"you","affinityDelta":-25,"reason":"拿走了她的剑"}]' };
      if (sys.includes("世界环境作家")) return { content: "x" };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "……" };
    };
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-evi", input: "我拿起她的剑。", llm });
    const lan = await repo.listMemories("w-evi", "c-lan");
    expect(lan.some((m) => m.text.includes("拿走了她的剑"))).toBe(true);
  });

  it("turns committed player consequences into witness memories without teaching absent characters", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-real-key");
    inst.state.objects["o-key"] = { id: "o-key", name: "铜钥匙", detail: "fleshed", locationId: "bar", state: "在吧台上", props: { portable: true } };
    inst.state.locations.bar.objectIds.push("o-key");
    await repo.upsertInstance(inst);

    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) {
        return { content: '[{"kind":"setObjectState","objectId":"o-key","state":"藏在地板下"},{"kind":"setFact","id":"f-key-hidden","entityId":"o-key","field":"hidden","value":"地板下","hardness":"anchored"}]' };
      }
      if (sys.includes("世界环境作家")) return { content: "x" };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "……" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-real-key", input: "我把铜钥匙藏到地板下。", inputChannel: "act", llm });

    const after = await repo.getInstance("w-real-key");
    expect(after?.state.objects["o-key"].state).toBe("藏在地板下");
    expect(after?.state.facts?.some((f) => f.id === "f-key-hidden" && f.hardness === "anchored")).toBe(true);

    const lan = await repo.listMemories("w-real-key", "c-lan");
    const zhou = await repo.listMemories("w-real-key", "c-zhou");
    const mei = await repo.listMemories("w-real-key", "c-mei");
    expect(lan.some((m) => m.text.includes("铜钥匙被你遮掩起来"))).toBe(true);
    expect(zhou.some((m) => m.text.includes("铜钥匙被你遮掩起来"))).toBe(true);
    expect(lan.some((m) => m.text.includes("地板下"))).toBe(false);
    expect(zhou.some((m) => m.text.includes("地板下"))).toBe(false);
    expect(mei.some((m) => m.text.includes("铜钥匙"))).toBe(false);
  });

  it("records reactor-batch consequences to the witnesses present before a scene move", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-batch-witness-scope");
    inst.state.locations.street.presentCharacterIds = ["c-mei"];
    inst.state.objects["o-key"] = { id: "o-key", name: "铜钥匙", detail: "fleshed", locationId: "bar", state: "在吧台上", props: { portable: true } };
    inst.state.locations.bar.objectIds.push("o-key");
    await repo.upsertInstance(inst);

    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) {
        return { content: '[{"kind":"moveScene","toLocationId":"street"},{"kind":"setFact","id":"f-key-hidden","entityId":"o-key","field":"hidden","value":"地板下","hardness":"anchored"}]' };
      }
      if (sys.includes("世界环境作家")) return { content: "x" };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "……" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-batch-witness-scope", input: "我把铜钥匙藏好，然后走到雨街。", inputChannel: "act", llm });

    const lan = await repo.listMemories("w-batch-witness-scope", "c-lan");
    const zhou = await repo.listMemories("w-batch-witness-scope", "c-zhou");
    const mei = await repo.listMemories("w-batch-witness-scope", "c-mei");
    expect(lan.some((m) => m.text.includes("铜钥匙被你遮掩起来"))).toBe(true);
    expect(zhou.some((m) => m.text.includes("铜钥匙被你遮掩起来"))).toBe(true);
    expect(lan.some((m) => m.text.includes("地板下"))).toBe(false);
    expect(zhou.some((m) => m.text.includes("地板下"))).toBe(false);
    expect(mei.some((m) => m.text.includes("铜钥匙"))).toBe(false);
  });

  it("turns player-caused owned-object consequences into relationship evidence", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-owned-object-reaction");
    inst.state.objects["o-ring"] = {
      id: "o-ring",
      name: "银戒指",
      detail: "fleshed",
      locationId: "bar",
      state: "放在吧台边",
      props: { portable: true, owner: "c-lan" },
    };
    inst.state.locations.bar.objectIds.push("o-ring");
    await repo.upsertInstance(inst);

    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) return { content: '[{"kind":"setObjectState","objectId":"o-ring","state":"被掰弯"}]' };
      if (sys.includes("世界环境作家")) return { content: "x" };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "……" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-owned-object-reaction", input: "我把银戒指掰弯。", llm });

    const after = await repo.getInstance("w-owned-object-reaction");
    const rel = after?.state.relationships?.["c-lan"]?.["you"];
    expect(rel?.affinity).toBeLessThan(0);
    expect(rel?.evidence.some((line) => line.includes("银戒指"))).toBe(true);

    const log = await repo.listDeltaLog("w-owned-object-reaction");
    expect(log.some((entry) => entry.source === "reactor" && entry.delta.kind === "setRelationship" && entry.delta.fromId === "c-lan" && entry.delta.toId === "you")).toBe(true);
  });

  it("does not blame the player for owned-object changes caused by another character", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-owned-object-npc");
    inst.state.objects["o-ring"] = {
      id: "o-ring",
      name: "银戒指",
      detail: "fleshed",
      locationId: "bar",
      state: "放在吧台边",
      props: { portable: true, owner: "c-lan" },
    };
    inst.state.locations.bar.objectIds.push("o-ring");
    await repo.upsertInstance(inst);

    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) return { content: '[{"kind":"setObjectState","objectId":"o-ring","state":"被掰弯"}]' };
      if (sys.includes("世界环境作家")) return { content: "x" };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "……" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-owned-object-npc", input: "老周把银戒指掰弯。", llm });

    const after = await repo.getInstance("w-owned-object-npc");
    expect(after?.state.objects["o-ring"].state).toBe("被掰弯");
    expect(after?.state.relationships?.["c-lan"]?.["you"]).toBeUndefined();
  });

  it("appends each applied delta to the event log with turn/source/cause, and bumps the turn counter", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-log"));
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) return { content: '[{"kind":"setObjectState","objectId":"o-glass","state":"打翻在吧台上"}]' };
      if (sys.includes("世界环境作家")) return { content: "x" };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "……" };
    };
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-log", input: "我把杯子碰翻。", llm });
    const log = await repo.listDeltaLog("w-log");
    const entry = log.find((e) => e.source === "reactor" && e.delta.kind === "setObjectState");
    expect(entry).toBeDefined();
    expect(entry?.turn).toBe(1);
    expect(entry?.cause).toBe("我把杯子碰翻。");
    expect(entry?.gameDay).toBe(1);
    expect((await repo.getInstance("w-log"))?.turn).toBe(1);
  });

  it("stamps the active branch id onto committed delta log and new memories", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-branch-stamp"));

    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) return { content: '[{"kind":"setObjectState","objectId":"o-glass","state":"刻着第一条分支"}]' };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "我记住你站在这里。" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-branch-stamp", input: "我把杯子转了半圈。", llm });

    const inst = await repo.getInstance("w-branch-stamp");
    expect(inst?.activeBranchId).toMatch(/^br/);
    const log = await repo.listDeltaLog("w-branch-stamp");
    expect(log.length).toBeGreaterThanOrEqual(1);
    expect(log.some((entry) => entry.source === "reactor" && entry.delta.kind === "setObjectState")).toBe(true);
    expect(log.some((entry) => entry.source === "director" && entry.delta.kind === "setFact")).toBe(true);
    expect(log.every((entry) => entry.branchId === inst?.activeBranchId)).toBe(true);
    const memories = await repo.listAllMemories("w-branch-stamp");
    expect(memories.length).toBeGreaterThan(0);
    expect(memories.every((memory) => memory.branchId === inst?.activeBranchId)).toBe(true);
  });

  it("lazily evolves the world on return after time away (off-screen, source-tagged in the log)", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-away");
    inst.lastSeenAt = Date.now() - 5 * 3_600_000; // away for 5 hours
    await repo.upsertInstance(inst);
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("离场演化器")) return { content: '[{"kind":"setCondition","entityId":"you","condition":"刚醒，睡眼惺忪"}]' };
      if (sys.includes("世界状态记录器")) return { content: "[]" };
      if (sys.includes("世界环境作家")) return { content: "x" };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "……" };
    };
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-away", input: "我回来了。", llm });
    const after = await repo.getInstance("w-away");
    expect(after?.state.roster["you"].condition).toBe("刚醒，睡眼惺忪");
    const log = await repo.listDeltaLog("w-away");
    expect(log.some((e) => e.source === "offscreen")).toBe(true);
  });

  it("spreads a salient observation between co-present characters as hearsay (gossip)", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-gossip"));
    // seed c-lan with one salient first-hand observation (c-lan and c-zhou are both in the bar)
    await repo.appendMemory({ id: "m-salient", instanceId: "w-gossip", charId: "c-lan", kind: "observation", text: "阿岚：那个背双刀的杀手摸进了后巷", keywords: ["杀手", "后巷"], importance: 8, createdAt: 1, lastAccessed: 1 });
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) return { content: "[]" };
      if (sys.includes("世界环境作家")) return { content: "x" };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "……" };
    };
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-gossip", input: "我环视酒馆。", llm });
    const zhou = await repo.listMemories("w-gossip", "c-zhou");
    expect(zhou.some((m) => m.kind === "hearsay" && m.text.includes("背双刀的杀手"))).toBe(true);
  });

  it("keeps a Director Note out of character knowledge and world mutation", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-director-note"));

    let llmCalls = 0;
    await runTurn({
      seed: DEMO_SEED,
      repo,
      instanceId: "w-director-note",
      input: "让这一幕慢一点，别让阿岚立刻摊牌。",
      inputChannel: "director-note",
      llm: async () => {
        llmCalls += 1;
        return { content: "不应该调用模型" };
      },
    });

    expect(llmCalls).toBe(0);
    const inst = await repo.getInstance("w-director-note");
    expect(inst?.directorNotes?.[0]?.text).toContain("慢一点");
    expect(inst?.turn).toBeUndefined();

    expect(await repo.listMessages("w-director-note")).toEqual([]);

    expect(await repo.listAllMemories("w-director-note")).toEqual([]);
    expect(await repo.listDeltaLog("w-director-note")).toEqual([]);
  });

  it("uses stored Director Notes only in Director context on the next world-facing turn", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-director-steer");
    inst.directorNotes = [{ id: "dn1", text: "让这一幕慢一点，别让阿岚立刻摊牌。", createdAt: 1 }];
    await repo.upsertInstance(inst);

    const directorPrompts: string[] = [];
    const nonDirectorPrompts: string[] = [];
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const joined = messages.map((m) => m.content).join("\n");
      if (sys.includes("世界环境导演")) {
        directorPrompts.push(joined);
        return { content: "雨声压低，酒馆里每个人都慢了半拍。" };
      }
      nonDirectorPrompts.push(joined);
      if (sys.includes("世界状态记录器")) return { content: "[]" };
      const last = messages[messages.length - 1]?.content ?? "";
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "（拔枪）别动！" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-director-steer", input: "（拔枪）别动！", llm });

    expect(directorPrompts.some((prompt) => prompt.includes("慢一点"))).toBe(true);
    expect(nonDirectorPrompts.some((prompt) => prompt.includes("慢一点"))).toBe(false);
    expect((await repo.listAllMemories("w-director-steer")).some((memory) => memory.text.includes("慢一点"))).toBe(false);
  });

  it("lets the Director guard use a character's own memories for projection-level knowledge checks", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-director-projection-guard"));
    await repo.appendMemory({
      id: "m-lan-lie",
      instanceId: "w-director-projection-guard",
      charId: "c-lan",
      kind: "observation",
      text: "你：我刚才在说谎。",
      keywords: keywordsOf("你：我刚才在说谎。"),
      importance: 6,
      createdAt: 1,
      lastAccessed: 1,
      provenance: "witnessed",
      confidence: 1,
      perceptionQuality: "full",
    });

    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      if (sys.includes("世界环境导演")) return { content: "阿岚知道你刚才在说谎。" };
      if (sys.includes("世界状态记录器")) return { content: "[]" };
      const last = messages[messages.length - 1]?.content ?? "";
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "（拔枪）别动！" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-director-projection-guard", input: "（逼近）你知道我在说谎吗！", llm });

    const msgs = await repo.listMessages("w-director-projection-guard");
    expect(msgs.some((msg) => msg.narration && msg.content === "阿岚知道你刚才在说谎。")).toBe(true);
  });

  it("keeps a Scene Contract out of character knowledge and world mutation", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-scene-contract"));

    let llmCalls = 0;
    await runTurn({
      seed: DEMO_SEED,
      repo,
      instanceId: "w-scene-contract",
      input: "本场慢烧，暂停外部追兵，强度保持中等。",
      inputChannel: "scene-contract",
      llm: async () => {
        llmCalls += 1;
        return { content: "不应该调用模型" };
      },
    });

    expect(llmCalls).toBe(0);
    const inst = await repo.getInstance("w-scene-contract");
    expect(inst?.sceneContract?.text).toContain("暂停外部追兵");
    expect(inst?.turn).toBeUndefined();

    expect(await repo.listMessages("w-scene-contract")).toEqual([]);

    expect(await repo.listAllMemories("w-scene-contract")).toEqual([]);
    expect(await repo.listDeltaLog("w-scene-contract")).toEqual([]);
  });

  it("uses the active Scene Contract only in Director context on the next world-facing turn", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-scene-contract-steer");
    inst.sceneContract = { id: "sc1", text: "本场慢烧，暂停外部追兵，强度保持中等。", createdAt: 1 };
    await repo.upsertInstance(inst);

    const directorPrompts: string[] = [];
    const nonDirectorPrompts: string[] = [];
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const joined = messages.map((m) => m.content).join("\n");
      if (sys.includes("世界环境导演")) {
        directorPrompts.push(joined);
        return { content: "檐下的火光稳住，远处追兵的马蹄声暂时沉下去。" };
      }
      nonDirectorPrompts.push(joined);
      if (sys.includes("世界状态记录器")) return { content: "[]" };
      const last = messages[messages.length - 1]?.content ?? "";
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "（拔枪）别动！" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-scene-contract-steer", input: "（拔枪）别动！", llm });

    expect(directorPrompts.some((prompt) => prompt.includes("暂停外部追兵"))).toBe(true);
    expect(nonDirectorPrompts.some((prompt) => prompt.includes("暂停外部追兵"))).toBe(false);
    expect((await repo.listAllMemories("w-scene-contract-steer")).some((memory) => memory.text.includes("暂停外部追兵"))).toBe(false);
  });

  it("commits a God Edit through the WriteGate with god provenance", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-god-edit"));

    let llmCalls = 0;
    await runTurn({
      seed: DEMO_SEED,
      repo,
      instanceId: "w-god-edit",
      input: '{"kind":"setFact","id":"f-god","field":"truth","value":"阿岚是王女","hardness":"core"}',
      inputChannel: "god-edit",
      llm: async () => {
        llmCalls += 1;
        return { content: "不应该调用模型" };
      },
    });

    expect(llmCalls).toBe(0);
    const inst = await repo.getInstance("w-god-edit");
    expect(inst?.turn).toBe(1);
    expect(inst?.state.facts?.[0]).toMatchObject({ id: "f-god", field: "truth", value: "阿岚是王女", hardness: "core" });

    const msgs = await repo.listMessages("w-god-edit");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toContain("上帝编辑");

    const log = await repo.listDeltaLog("w-god-edit");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ source: "god", turn: 1 });
    expect(log[0].cause).toContain("上帝编辑");
    expect(await repo.listAllMemories("w-god-edit")).toEqual([]);
  });

  it("reconciles witnesses when a God Edit rewrites an existing fact", async () => {
    const repo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-god-reconcile");
    inst.state.facts = [{ id: "f-old", field: "truth", value: "阿岚是掌柜", hardness: "anchored", sinceDay: 1 }];
    await repo.upsertInstance(inst);
    await repo.appendMemory({
      id: "m-old",
      instanceId: "w-god-reconcile",
      charId: "c-lan",
      kind: "observation",
      text: "我亲眼确认过：阿岚是掌柜。",
      keywords: keywordsOf("我亲眼确认过：阿岚是掌柜。"),
      importance: 6,
      createdAt: 1,
      lastAccessed: 1,
      provenance: "witnessed",
      confidence: 1,
      perceptionQuality: "full",
    });

    await runTurn({
      seed: DEMO_SEED,
      repo,
      instanceId: "w-god-reconcile",
      input: '{"kind":"setFact","id":"f-god","field":"truth","value":"阿岚是王女","hardness":"core"}',
      inputChannel: "god-edit",
      llm: async () => ({ content: "不应该调用模型" }),
    });

    const memories = await repo.listMemories("w-god-reconcile", "c-lan");
    expect(memories).toHaveLength(2);
    expect(memories[0].text).toContain("阿岚是掌柜");
    expect(memories[1]).toMatchObject({ kind: "reflection", provenance: "authored", evidence: ["m-old"] });
    expect(memories[1].text).toContain("阿岚是王女");
  });

  it("rolls back a God Edit when a later persistence step fails", async () => {
    const baseRepo = getRepository();
    const inst = instantiate(DEMO_SEED, 1, "w-god-rollback");
    inst.state.facts = [{ id: "f-old", field: "truth", value: "阿岚是掌柜", hardness: "anchored", sinceDay: 1 }];
    await baseRepo.upsertInstance(inst);
    await baseRepo.appendMemory({
      id: "m-old",
      instanceId: "w-god-rollback",
      charId: "c-lan",
      kind: "observation",
      text: "我亲眼确认过：阿岚是掌柜。",
      keywords: keywordsOf("我亲眼确认过：阿岚是掌柜。"),
      importance: 6,
      createdAt: 1,
      lastAccessed: 1,
      provenance: "witnessed",
      confidence: 1,
      perceptionQuality: "full",
    });
    let failNextReflection = true;
    const failingRepo = new Proxy(baseRepo, {
      get(target, prop: keyof Repository) {
        if (prop === "appendMemory") {
          return async (memory: Memory) => {
            if (failNextReflection && memory.kind === "reflection") {
              failNextReflection = false;
              throw new Error("simulated memory write failure");
            }
            return target.appendMemory(memory);
          };
        }
        const value = target[prop];
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as Repository;

    await expect(runTurn({
      seed: DEMO_SEED,
      repo: failingRepo,
      instanceId: "w-god-rollback",
      input: '{"kind":"setFact","id":"f-god","field":"truth","value":"阿岚是王女","hardness":"core"}',
      inputChannel: "god-edit",
      llm: async () => ({ content: "不应该调用模型" }),
    })).rejects.toThrow("simulated memory write failure");

    const after = await baseRepo.getInstance("w-god-rollback");
    expect(after?.state.facts?.map((fact) => fact.value)).toEqual(["阿岚是掌柜"]);
    expect(after?.turn).toBeUndefined();
    expect(await baseRepo.listMessages("w-god-rollback")).toEqual([]);
    expect((await baseRepo.listMemories("w-god-rollback", "c-lan")).map((memory) => memory.id)).toEqual(["m-old"]);
    expect(await baseRepo.listDeltaLog("w-god-rollback")).toEqual([]);
    expect((await baseRepo.listAuditMessages("w-god-rollback")).some((message) => message.archived)).toBe(true);
    expect((await baseRepo.listAuditDeltaLog("w-god-rollback")).some((entry) => entry.archived && entry.source === "god")).toBe(true);
  });

  it("does not reconcile subjective memories from another world instance during a God Edit", async () => {
    const repo = getRepository();
    const edited = instantiate(DEMO_SEED, 1, "w-god-reconcile-isolated");
    edited.state.facts = [{ id: "f-old", field: "truth", value: "阿岚是掌柜", hardness: "anchored", sinceDay: 1 }];
    await repo.upsertInstance(edited);
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-other"));
    await repo.appendMemory(testMemory("w-other", "m-other", "c-lan", "我亲眼确认过：阿岚是掌柜。"));

    await runTurn({
      seed: DEMO_SEED,
      repo,
      instanceId: "w-god-reconcile-isolated",
      input: '{"kind":"setFact","id":"f-god","field":"truth","value":"阿岚是王女","hardness":"core"}',
      inputChannel: "god-edit",
      llm: async () => ({ content: "不应该调用模型" }),
    });

    const otherMemories = await repo.listAllMemories("w-other");
    expect(otherMemories.find((memory) => memory.id === "m-other")).toMatchObject({ instanceId: "w-other" });
    expect(otherMemories.some((memory) => memory.kind === "reflection" && memory.evidence?.includes("m-other"))).toBe(false);
    expect((await repo.listAllMemories("w-god-reconcile-isolated")).some((memory) => memory.evidence?.includes("m-other"))).toBe(false);
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

    // must have a speaker-start event
    const starts = events.filter((e) => e.type === "speaker-start");
    expect(starts.length).toBeGreaterThan(0);

    // must have delta events
    const deltas = events.filter((e) => e.type === "delta");
    expect(deltas.length).toBeGreaterThan(0);

    // must have a speaker-end event whose content is the prefix-stripped text
    const ends = events.filter((e) => e.type === "speaker-end");
    expect(ends.length).toBeGreaterThan(0);
    expect(ends[0].content).toBe("片段");

    // speaker-start and speaker-end share the id of the same persisted message
    const startId = starts[0].id;
    const endId = ends[0].id;
    expect(startId).toBe(endId);

    // persisted message exists and has the correct content
    const msgs = await repo.listMessages("w3");
    const persisted = msgs.find((m) => m.id === startId);
    expect(persisted).toBeDefined();
    expect(persisted?.content).toBe("片段");
    expect(persisted?.role).toBe("assistant");
  });

  it("regenerates the last turn by restoring prior state and replacing turn messages, memories, and delta log", async () => {
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
      if (sys.includes("提炼出 2–3 条")) return { content: "[]" };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: replies.shift() ?? "意外回应" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-regen", input: "第一句。", llm });
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-regen", input: "我把杯子碰了一下。", llm });

    let msgs = await repo.listMessages("w-regen");
    expect(msgs.some((m) => m.content === "旧回应")).toBe(true);
    let inst = await repo.getInstance("w-regen");
    expect(inst?.state.objects["o-glass"]?.state).toBe("旧状态");
    let deltaLog = await repo.listDeltaLog("w-regen");
    expect(deltaLog.some((e) => e.delta.kind === "setObjectState" && e.delta.state === "旧状态")).toBe(true);

    await regenerateLastTurn({ seed: DEMO_SEED, repo, instanceId: "w-regen", llm });

    msgs = await repo.listMessages("w-regen");
    expect(msgs.filter((m) => m.role === "user").map((m) => m.content)).toEqual(["第一句。", "我把杯子碰了一下。"]);
    expect(msgs.some((m) => m.content === "旧回应")).toBe(false);
    expect(msgs.some((m) => m.content === "新回应")).toBe(true);

    inst = await repo.getInstance("w-regen");
    expect(inst?.state.objects["o-glass"]?.state).toBe("新状态");
    deltaLog = await repo.listDeltaLog("w-regen");
    expect(deltaLog.some((e) => e.delta.kind === "setObjectState" && e.delta.state === "旧状态")).toBe(false);
    expect(deltaLog.some((e) => e.delta.kind === "setObjectState" && e.delta.state === "新状态")).toBe(true);

    const lanMemories = await repo.listMemories("w-regen", "c-lan");
    expect(lanMemories.some((m) => m.text.includes("旧回应"))).toBe(false);
    expect(lanMemories.some((m) => m.text.includes("新回应"))).toBe(true);
  });

  it("rewinds the last turn without rerunning the model or leaking messages, memories, or delta log", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-rewind"));

    let llmCalls = 0;
    const llm = async (messages: ChatMessage[]) => {
      llmCalls += 1;
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) return { content: '[{"kind":"setObjectState","objectId":"o-glass","state":"回退前状态"}]' };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "回退前回应" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-rewind", input: "我把杯子碰了一下。", llm });
    expect(await repo.listDeltaLog("w-rewind")).not.toHaveLength(0);
    const callsAfterTurn = llmCalls;

    await rewindLastTurn({ repo, instanceId: "w-rewind" });

    expect(llmCalls).toBe(callsAfterTurn);
    expect(await repo.listMessages("w-rewind")).toEqual([]);
    expect(await repo.listAllMemories("w-rewind")).toEqual([]);
    expect(await repo.listDeltaLog("w-rewind")).toEqual([]);
    const inst = await repo.getInstance("w-rewind");
    expect(inst?.state.objects["o-glass"]?.state).toBe("空着，杯底一圈水痕");
    expect(inst?.turn).toBeUndefined();
    expect(inst?.lastTurnSnapshot).toBeUndefined();
  });

  it("rewind hides last-turn records from the active view without physically deleting history", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-rewind-append-only"));

    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) return { content: '[{"kind":"setObjectState","objectId":"o-glass","state":"回退前状态"}]' };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "回退前回应" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-rewind-append-only", input: "我把杯子碰了一下。", llm });
    await rewindLastTurn({ repo, instanceId: "w-rewind-append-only" });

    expect(await repo.listMessages("w-rewind-append-only")).toEqual([]);
    expect(await repo.listAllMemories("w-rewind-append-only")).toEqual([]);
    expect(await repo.listDeltaLog("w-rewind-append-only")).toEqual([]);
    expect((await repo.listAuditMessages("w-rewind-append-only")).length).toBeGreaterThan(0);
    expect((await repo.listAuditMemories("w-rewind-append-only")).length).toBeGreaterThan(0);
    expect((await repo.listAuditDeltaLog("w-rewind-append-only")).length).toBeGreaterThan(0);

    const db = new AnywhereDoorDB();
    try {
      const rawMessages = await db.messages.where("instanceId").equals("w-rewind-append-only").toArray();
      const rawMemories = await db.memories.where("instanceId").equals("w-rewind-append-only").toArray();
      const rawDeltaLog = await db.deltaLog.where("instanceId").equals("w-rewind-append-only").toArray();
      expect(rawMessages.length).toBeGreaterThan(0);
      expect(rawMemories.length).toBeGreaterThan(0);
      expect(rawDeltaLog.length).toBeGreaterThan(0);
      expect(rawMessages.every((m) => m.archived === true)).toBe(true);
      expect(rawMemories.every((m) => m.archived === true)).toBe(true);
      expect(rawDeltaLog.every((e) => e.archived === true)).toBe(true);
    } finally {
      db.close();
    }
  });

  it("waits for an in-flight turn lock before rewinding the timeline", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-rewind-lock"));

    let blockNextReactor = false;
    let reactorStarted!: () => void;
    let releaseReactor!: () => void;
    const reactorStartedPromise = new Promise<void>((resolve) => { reactorStarted = resolve; });
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) {
        if (blockNextReactor) {
          reactorStarted();
          await new Promise<void>((resolve) => { releaseReactor = resolve; });
          return { content: '[{"kind":"setObjectState","objectId":"o-glass","state":"第二回合状态"}]' };
        }
        return { content: '[{"kind":"setObjectState","objectId":"o-glass","state":"第一回合状态"}]' };
      }
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "回应" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-rewind-lock", input: "第一句。", llm });
    blockNextReactor = true;
    const inFlight = runTurn({ seed: DEMO_SEED, repo, instanceId: "w-rewind-lock", input: "第二句。", llm });
    await reactorStartedPromise;

    const rewind = rewindLastTurn({ repo, instanceId: "w-rewind-lock" });
    const settledBeforeRelease = await Promise.race([
      rewind.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 15)),
    ]);
    expect(settledBeforeRelease).toBe(false);

    releaseReactor();
    await inFlight;
    await rewind;
  });

  it("rewinds only the current world instance without deleting another instance's memories", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-rewind-isolated"));
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-other"));

    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) return { content: '[{"kind":"setObjectState","objectId":"o-glass","state":"回退前状态"}]' };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "回退前回应" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-rewind-isolated", input: "我把杯子碰了一下。", llm });
    await repo.appendMemory(testMemory("w-other", "m-other-after-snapshot", "c-lan", "另一扇门里，阿岚记得别的事。"));

    await rewindLastTurn({ repo, instanceId: "w-rewind-isolated" });

    const otherMemories = await repo.listAllMemories("w-other");
    expect(otherMemories.find((memory) => memory.id === "m-other-after-snapshot")).toMatchObject({ instanceId: "w-other" });
    expect((await repo.listAllMemories("w-rewind-isolated")).some((memory) => memory.instanceId === "w-rewind-isolated")).toBe(false);
  });

  it("forks the last turn by archiving the current branch and rewinding the active branch to the snapshot waterline", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-fork"));

    const replies = ["第一次回应", "分叉前回应"];
    const objectStates = ["第一次状态", "分叉前状态"];
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

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-fork", input: "第一句。", llm });
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-fork", input: "我追问雪莲那个名字。", llm });
    const beforeFork = await repo.getInstance("w-fork");
    expect(beforeFork?.activeBranchId).toBeDefined();

    const archived = await forkLastTurn({ repo, instanceId: "w-fork", title: "保留追问卫从云" });

    const branches = await repo.listTimelineBranches("w-fork");
    expect(branches.map((b) => b.id)).toEqual([archived.id]);
    expect(archived.id).toBe(beforeFork?.activeBranchId);
    expect(branches[0]).toMatchObject({ title: "保留追问卫从云", forkedFromTurn: 2 });
    expect(branches[0].snapshot.activeBranchId).toBe(archived.id);
    expect(branches[0].snapshot.messages.some((m) => m.content === "分叉前回应")).toBe(true);
    expect(branches[0].snapshot.deltaLog.some((e) => e.delta.kind === "setObjectState" && e.delta.state === "分叉前状态")).toBe(true);
    expect(branches[0].snapshot.deltaLog.every((e) => e.branchId === archived.id)).toBe(true);
    expect(branches[0].snapshot.memories.length).toBeGreaterThan(0);
    expect(branches[0].snapshot.memories.every((m) => m.branchId === archived.id)).toBe(true);
    expect(branches[0].snapshot.state.objects["o-glass"]?.state).toBe("分叉前状态");

    const msgs = await repo.listMessages("w-fork");
    expect(msgs.filter((m) => m.role === "user").map((m) => m.content)).toEqual(["第一句。"]);
    expect(msgs.some((m) => m.content === "分叉前回应")).toBe(false);
    const inst = await repo.getInstance("w-fork");
    expect(inst?.state.objects["o-glass"]?.state).toBe("第一次状态");
    expect(inst?.activeBranchId).toBeDefined();
    expect(inst?.activeBranchId).not.toBe(archived.id);
    const log = await repo.listDeltaLog("w-fork");
    expect(log.some((e) => e.delta.kind === "setObjectState" && e.delta.state === "分叉前状态")).toBe(false);
  });

  it("stamps legacy branchless memories and delta logs when archiving a timeline branch", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-legacy-fork"));
    const llm = async (messages: ChatMessage[]) => {
      const sys = messages[0]?.content ?? "";
      const last = messages[messages.length - 1]?.content ?? "";
      if (sys.includes("世界状态记录器")) return { content: '[{"kind":"setObjectState","objectId":"o-glass","state":"分支状态"}]' };
      if (last.includes("暂停扮演")) return { content: '{"action":"pass","eagerness":0.1}' };
      return { content: "分支回应" };
    };

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-legacy-fork", input: "我碰了碰杯子。", llm });
    await repo.appendMemory({ ...buildSelfMemory("w-legacy-fork", "c-lan", "旧版记忆，没有分支标记"), id: "mem-legacy" });
    await repo.appendDeltaLog({
      id: "delta-legacy",
      instanceId: "w-legacy-fork",
      turn: 1,
      source: "reactor",
      cause: "legacy",
      gameDay: 1,
      gameClock: "夜",
      at: 999,
      delta: { kind: "setObjectState", objectId: "o-glass", state: "旧版状态" },
    });

    const archived = await forkLastTurn({ repo, instanceId: "w-legacy-fork", title: "带旧记录的分支" });

    expect(archived.snapshot.memories.find((m) => m.id === "mem-legacy")?.branchId).toBe(archived.id);
    expect(archived.snapshot.deltaLog.find((e) => e.id === "delta-legacy")?.branchId).toBe(archived.id);
  });

  it("restores an archived timeline branch while preserving the current active branch as another archive", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-restore-branch"));

    const replies = ["第一次回应", "旧分支回应", "新分支回应"];
    const objectStates = ["第一次状态", "旧分支状态", "新分支状态"];
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

    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-restore-branch", input: "第一句。", llm });
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-restore-branch", input: "旧分支。", llm });
    const oldBranch = await forkLastTurn({ repo, instanceId: "w-restore-branch", title: "旧分支" });
    await runTurn({ seed: DEMO_SEED, repo, instanceId: "w-restore-branch", input: "新分支。", llm });
    const beforeRestore = await repo.getInstance("w-restore-branch");
    expect(beforeRestore?.activeBranchId).not.toBe(oldBranch.id);

    await restoreTimelineBranch({ repo, instanceId: "w-restore-branch", branchId: oldBranch.id, title: "切换前的新分支" });

    const msgs = await repo.listMessages("w-restore-branch");
    expect(msgs.some((m) => m.content === "旧分支回应")).toBe(true);
    expect(msgs.some((m) => m.content === "新分支回应")).toBe(false);
    const inst = await repo.getInstance("w-restore-branch");
    expect(inst?.state.objects["o-glass"]?.state).toBe("旧分支状态");
    expect(inst?.activeBranchId).toBe(oldBranch.id);
    const log = await repo.listDeltaLog("w-restore-branch");
    expect(log.some((e) => e.delta.kind === "setObjectState" && e.delta.state === "旧分支状态")).toBe(true);
    expect(log.some((e) => e.delta.kind === "setObjectState" && e.delta.state === "新分支状态")).toBe(false);
    expect(log.every((e) => e.branchId === oldBranch.id)).toBe(true);

    const branches = await repo.listTimelineBranches("w-restore-branch");
    expect(branches).toHaveLength(2);
    expect(branches.some((b) => b.title === "切换前的新分支" && b.id === beforeRestore?.activeBranchId && b.snapshot.state.objects["o-glass"]?.state === "新分支状态")).toBe(true);
  });

  it("stamps legacy branchless records when restoring an archived timeline branch", async () => {
    const repo = getRepository();
    await repo.upsertInstance(instantiate(DEMO_SEED, 1, "w-legacy-restore"));
    const inst = (await repo.getInstance("w-legacy-restore"))!;
    await repo.upsertTimelineBranch({
      id: "br-legacy",
      instanceId: "w-legacy-restore",
      seedId: DEMO_SEED.id,
      title: "旧版分支",
      createdAt: 1,
      updatedAt: 1,
      snapshot: {
        state: inst.state,
        activeBranchId: undefined,
        messages: [],
        memories: [{ ...buildSelfMemory("w-legacy-restore", "c-lan", "旧版分支里的记忆"), id: "mem-restore-legacy" }],
        deltaLog: [{
          id: "delta-restore-legacy",
          instanceId: "w-legacy-restore",
          turn: 1,
          source: "reactor",
          cause: "legacy",
          gameDay: 1,
          gameClock: "夜",
          at: 999,
          delta: { kind: "setObjectState", objectId: "o-glass", state: "旧版分支状态" },
        }],
        turn: 1,
      },
    });

    await restoreTimelineBranch({ repo, instanceId: "w-legacy-restore", branchId: "br-legacy" });

    expect((await repo.getInstance("w-legacy-restore"))?.activeBranchId).toBe("br-legacy");
    expect((await repo.listAllMemories("w-legacy-restore")).find((m) => m.id === "mem-restore-legacy")?.branchId).toBe("br-legacy");
    expect((await repo.listDeltaLog("w-legacy-restore")).find((e) => e.id === "delta-restore-legacy")?.branchId).toBe("br-legacy");
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
    const memories = await repo.listAllMemories("w-fail");
    expect(memories).toEqual([]);
    const inst = await repo.getInstance("w-fail");
    expect(inst?.lastTurnSnapshot).toBeUndefined();
    expect(inst?.state.objects["o-glass"]?.state).toBe("空着，杯底一圈水痕");
  });
});
