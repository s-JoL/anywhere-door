import { describe, expect, it } from "vitest";
import { buildStudioInspector } from "../inspector";
import { keywordsOf } from "../../memory/keywords";
import type { DeltaLogEntry } from "../../world/delta";
import type { Memory, WorldInstance } from "../../types";

const instance: WorldInstance = {
  id: "w1",
  seedId: "s1",
  createdAt: 1,
  updatedAt: 2,
  directorNotes: [
    { id: "dn1", text: "慢一点，不要立刻摊牌。", createdAt: 10 },
    { id: "dn2", text: "让阿岚更主动。", createdAt: 11 },
  ],
  sceneContract: { id: "sc1", text: "本场慢烧，暂停外部追兵，强度中等。", createdAt: 12 },
  state: {
    currentLocationId: "bar",
    time: { day: 1, clock: "深夜", lighting: "冷光" },
    locations: {
      bar: {
        id: "bar",
        name: "雨夜酒馆",
        detail: "fleshed",
        gist: "",
        connections: [],
        presentCharacterIds: ["c-lan", "c-zhou"],
        objectIds: [],
      },
    },
    objects: {},
    roster: { "c-lan": { name: "阿岚" }, "c-zhou": { name: "老周" } },
    flags: {},
    facts: [{ id: "f1", entityId: "c-lan", field: "truth", value: "王女", hardness: "core", sinceDay: 1 }],
    pressureLines: [{ id: "p1", summary: "追兵逼近山道", status: "active", intensity: 6, playerKnown: true }],
  },
};

function memory(text: string): Memory {
  return {
    id: "m1",
    instanceId: "w1",
    charId: "c-zhou",
    kind: "observation",
    text,
    keywords: keywordsOf(text),
    importance: 7,
    createdAt: 5,
    lastAccessed: 5,
    provenance: "witnessed",
    confidence: 1,
  };
}

function distortedMemory(text: string): Memory {
  return {
    ...memory(text),
    id: "m-distorted",
    text,
    keywords: keywordsOf(text),
    perceptionQuality: "garbled",
    distortion: "老周把身份记成了逃犯。",
  };
}

const deltaLog: DeltaLogEntry[] = [
  {
    id: "dl1",
    instanceId: "w1",
    turn: 1,
    source: "god",
    cause: "上帝编辑：设定阿岚身份",
    gameDay: 1,
    gameClock: "深夜",
    at: 20,
    delta: { kind: "setFact", id: "f1", entityId: "c-lan", field: "truth", value: "王女", hardness: "core" },
  },
];

describe("buildStudioInspector", () => {
  it("assembles a compact Studio / Context Inspector snapshot", () => {
    const snapshot = buildStudioInspector({
      instance,
      memories: [memory("老周：我亲眼见过阿岚亮出王女的纹章。")],
      deltaLog,
    });

    expect(snapshot.locationName).toBe("雨夜酒馆");
    expect(snapshot.presentCharacters.map((c) => c.name)).toEqual(["阿岚", "老周"]);
    expect(snapshot.directorNotes).toEqual(["慢一点，不要立刻摊牌。", "让阿岚更主动。"]);
    expect(snapshot.sceneContract).toBe("本场慢烧，暂停外部追兵，强度中等。");
    expect(snapshot.facts[0]).toMatchObject({ label: "c-lan.truth = 王女", hardness: "core" });
    expect(snapshot.pressureLines[0]).toMatchObject({ summary: "追兵逼近山道", status: "active", intensity: 6 });
    expect(snapshot.recentDeltas[0]).toMatchObject({ source: "god", kind: "setFact", turn: 1 });
    expect(snapshot.beliefs[0]).toMatchObject({ observerId: "c-zhou", observerName: "老周", factId: "f1", stance: "knows" });
  });

  it("keeps misbelief visible as subjective evidence without changing canon facts", () => {
    const snapshot = buildStudioInspector({
      instance,
      memories: [distortedMemory("老周：我确信阿岚是逃犯，不是什么王女。")],
      deltaLog,
    });

    expect(snapshot.facts).toEqual([{ id: "f1", label: "c-lan.truth = 王女", hardness: "core" }]);
    expect(snapshot.beliefs).toHaveLength(1);
    expect(snapshot.beliefs[0]).toMatchObject({
      observerId: "c-zhou",
      observerName: "老周",
      factId: "f1",
      stance: "wrong",
      evidenceText: "老周：我确信阿岚是逃犯，不是什么王女。",
    });
  });
});
