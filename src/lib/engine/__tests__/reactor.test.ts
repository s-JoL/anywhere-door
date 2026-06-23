import { describe, it, expect } from "vitest";
import { parseDeltas, buildReactorPrompt, react } from "../reactor";
import type { WorldState } from "../../types";

function baseState(): WorldState {
  return {
    currentLocationId: "bar",
    time: { day: 1, clock: "深夜 23:40", lighting: "霓虹透过雨窗的冷光" },
    locations: {
      bar: {
        id: "bar",
        name: "無燈酒馆",
        detail: "fleshed",
        gist: "狭长的吧台",
        connections: ["street"],
        presentCharacterIds: ["c-lan"],
        objectIds: ["o-glass"],
      },
      street: {
        id: "street",
        name: "雨街",
        detail: "stub",
        gist: "湿漉漉的霓虹长街",
        connections: ["bar"],
        presentCharacterIds: [],
        objectIds: [],
      },
    },
    objects: {
      "o-glass": {
        id: "o-glass",
        name: "威士忌杯",
        detail: "fleshed",
        props: { portable: true },
        locationId: "bar",
        state: "空着，杯底一圈水痕",
      },
    },
    roster: {
      "c-lan": { name: "阿岚" },
      "you": { name: "你" },
    },
    flags: {},
  };
}

describe("parseDeltas", () => {
  it("extracts valid deltas from JSON array", () => {
    const text = '[{"kind":"setObjectState","objectId":"o-glass","state":"打翻"},{"kind":"setCondition","entityId":"you","condition":"湿透"}]';
    const result = parseDeltas(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ kind: "setObjectState", objectId: "o-glass", state: "打翻" });
    expect(result[1]).toEqual({ kind: "setCondition", entityId: "you", condition: "湿透" });
  });

  it("returns [] for garbage input", () => {
    expect(parseDeltas("some prose text")).toEqual([]);
    expect(parseDeltas("")).toEqual([]);
    expect(parseDeltas("{not array}")).toEqual([]);
  });

  it("drops elements with unknown kind", () => {
    const text = '[{"kind":"unknownKind","foo":"bar"},{"kind":"setFlag","key":"x","value":true}]';
    const result = parseDeltas(text);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("setFlag");
  });

  it("caps at 8 deltas", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ kind: "setFlag", key: `k${i}`, value: true }));
    const text = JSON.stringify(items);
    const result = parseDeltas(text);
    expect(result).toHaveLength(8);
  });

  it("handles all 6 original valid kinds", () => {
    const text = JSON.stringify([
      { kind: "moveCharacter", characterId: "c1", toLocationId: "loc1" },
      { kind: "setObjectState", objectId: "o1", state: "broken" },
      { kind: "setFlag", key: "done", value: true },
      { kind: "advanceTime", clock: "深夜", lighting: "暗", dayDelta: 1 },
      { kind: "setCondition", entityId: "you", condition: "受伤" },
      { kind: "establishObject", id: "new-obj", name: "匕首", locationId: "bar" },
    ]);
    const result = parseDeltas(text);
    expect(result).toHaveLength(6);
  });

  it("accepts establishLocation kind with required fields", () => {
    const text = JSON.stringify([
      { kind: "establishLocation", id: "backroom", name: "里屋", gist: "昏暗内室", connectFrom: "bar" },
    ]);
    const result = parseDeltas(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ kind: "establishLocation", id: "backroom", name: "里屋", gist: "昏暗内室", connectFrom: "bar" });
  });

  it("drops establishLocation missing required id or name", () => {
    const text = JSON.stringify([
      { kind: "establishLocation", name: "里屋" }, // missing id
      { kind: "establishLocation", id: "backroom" }, // missing name
    ]);
    const result = parseDeltas(text);
    expect(result).toHaveLength(0);
  });

  it("accepts moveScene kind with required toLocationId", () => {
    const text = JSON.stringify([
      { kind: "moveScene", toLocationId: "backroom" },
    ]);
    const result = parseDeltas(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ kind: "moveScene", toLocationId: "backroom" });
  });

  it("drops moveScene missing toLocationId", () => {
    const text = JSON.stringify([
      { kind: "moveScene" }, // missing toLocationId
    ]);
    const result = parseDeltas(text);
    expect(result).toHaveLength(0);
  });

  it("parseDeltas: accepts setRelationship", () => {
    const text = '[{"kind":"setRelationship","fromId":"c-lan","toId":"you","disposition":"戒备松动"}]';
    const result = parseDeltas(text);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("setRelationship");
    const d = result[0] as { kind: "setRelationship"; fromId: string; toId: string; disposition: string };
    expect(d.fromId).toBe("c-lan");
    expect(d.toId).toBe("you");
    expect(d.disposition).toBe("戒备松动");
  });

  it("parseDeltas: rejects setRelationship missing disposition", () => {
    const text = '[{"kind":"setRelationship","fromId":"c-lan","toId":"you"}]';
    const result = parseDeltas(text);
    expect(result).toHaveLength(0);
  });

  it("accepts all 8 kinds together", () => {
    const text = JSON.stringify([
      { kind: "moveCharacter", characterId: "c1", toLocationId: "loc1" },
      { kind: "setObjectState", objectId: "o1", state: "broken" },
      { kind: "setFlag", key: "done", value: true },
      { kind: "advanceTime", clock: "深夜", lighting: "暗", dayDelta: 1 },
      { kind: "setCondition", entityId: "you", condition: "受伤" },
      { kind: "establishObject", id: "new-obj", name: "匕首", locationId: "bar" },
      { kind: "establishLocation", id: "backroom", name: "里屋" },
      { kind: "moveScene", toLocationId: "backroom" },
    ]);
    const result = parseDeltas(text);
    expect(result).toHaveLength(8);
  });

  it("drops setCondition missing required fields", () => {
    const text = '[{"kind":"setCondition","entityId":"you"},{"kind":"setCondition","condition":"受伤"}]';
    const result = parseDeltas(text);
    expect(result).toHaveLength(0);
  });

  it("drops establishObject missing required fields", () => {
    const text = '[{"kind":"establishObject","id":"x","name":"y"}]'; // missing locationId
    const result = parseDeltas(text);
    expect(result).toHaveLength(0);
  });
});

describe("buildReactorPrompt", () => {
  it("system message contains 世界状态记录器", () => {
    const msgs = buildReactorPrompt(baseState(), [], { "c-lan": "阿岚", you: "你" });
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("世界状态记录器");
  });

  it("user message contains current location, roster, objects, and recent lines", () => {
    const msgs = buildReactorPrompt(baseState(), ["你：我把杯子碰翻了。"], { "c-lan": "阿岚", you: "你" });
    const userMsg = msgs[1].content;
    expect(userMsg).toContain("無燈酒馆");
    expect(userMsg).toContain("c-lan");
    expect(userMsg).toContain("阿岚");
    expect(userMsg).toContain("o-glass");
    expect(userMsg).toContain("我把杯子碰翻了");
  });

  it("includes condition in roster list when set", () => {
    const state = baseState();
    state.roster["you"] = { name: "你", condition: "浑身湿透" };
    const msgs = buildReactorPrompt(state, [], { you: "你" });
    expect(msgs[1].content).toContain("浑身湿透");
  });
});

describe("react", () => {
  it("returns parsed deltas from llm response", async () => {
    const fakeLlm = async () => ({
      content: '[{"kind":"setObjectState","objectId":"o-glass","state":"打翻在吧台上"},{"kind":"setCondition","entityId":"you","condition":"浑身湿透"}]',
    });
    const state = baseState();
    const deltas = await react({
      state,
      recentLines: ["你：我把杯子碰翻了。"],
      nameById: { you: "你" },
      llm: fakeLlm,
    });
    expect(deltas).toHaveLength(2);
    expect(deltas[0]).toEqual({ kind: "setObjectState", objectId: "o-glass", state: "打翻在吧台上" });
    expect(deltas[1]).toEqual({ kind: "setCondition", entityId: "you", condition: "浑身湿透" });
  });

  it("returns [] on llm error", async () => {
    const failLlm = async () => { throw new Error("network fail"); };
    const state = baseState();
    const deltas = await react({
      state,
      recentLines: [],
      nameById: {},
      llm: failLlm as never,
    });
    expect(deltas).toEqual([]);
  });

  it("returns [] when llm returns prose with no JSON array", async () => {
    const proseLlm = async () => ({ content: "没有任何变化，一切如故。" });
    const state = baseState();
    const deltas = await react({ state, recentLines: [], nameById: {}, llm: proseLlm });
    expect(deltas).toEqual([]);
  });

  it("react: returns setRelationship delta", async () => {
    const fakeLlm = async () => ({
      content: '[{"kind":"setRelationship","fromId":"c-lan","toId":"you","disposition":"戒备松动"}]',
    });
    const state = baseState();
    const deltas = await react({
      state,
      recentLines: [],
      nameById: { "c-lan": "阿岚", you: "你" },
      llm: fakeLlm,
    });
    expect(deltas).toHaveLength(1);
    expect(deltas[0].kind).toBe("setRelationship");
  });

  it("returns establishLocation + moveScene + moveCharacter from fake llm", async () => {
    const fakeLlm = async () => ({
      content: '[{"kind":"establishLocation","id":"back","name":"里屋","connectFrom":"bar"},{"kind":"moveScene","toLocationId":"back"},{"kind":"moveCharacter","characterId":"c-lan","toLocationId":"back"}]',
    });
    const state = baseState();
    const deltas = await react({
      state,
      recentLines: ["你：我拽她进里屋。"],
      nameById: { "c-lan": "阿岚", you: "你" },
      llm: fakeLlm,
    });
    expect(deltas).toHaveLength(3);
    expect(deltas[0]).toEqual({ kind: "establishLocation", id: "back", name: "里屋", connectFrom: "bar" });
    expect(deltas[1]).toEqual({ kind: "moveScene", toLocationId: "back" });
    expect(deltas[2]).toEqual({ kind: "moveCharacter", characterId: "c-lan", toLocationId: "back" });
  });
});
