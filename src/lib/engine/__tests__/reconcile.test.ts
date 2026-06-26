import { describe, expect, it } from "vitest";
import { reconcileGodEditMemories } from "../reconcile";
import { keywordsOf } from "../../memory/keywords";
import type { Memory, WorldState } from "../../types";

const state: WorldState = {
  currentLocationId: "bar",
  time: { day: 1, clock: "深夜", lighting: "冷光" },
  locations: { bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: [], presentCharacterIds: ["c-lan"], objectIds: [] } },
  roster: { "c-lan": { name: "阿岚" }, "c-zhou": { name: "老周" }, you: { name: "你" } },
  objects: { "o-key": { id: "o-key", name: "铜钥匙", detail: "fleshed", props: { portable: true }, locationId: "bar", state: "在吧台上" } },
  flags: {},
  facts: [{ id: "f-old", field: "truth", value: "阿岚是掌柜", hardness: "anchored", sinceDay: 1 }],
  relationships: {
    "c-lan": {
      you: { affinity: 30, disposition: "信任你", evidence: ["你曾替她挡下麻烦"], sinceDay: 1 },
    },
  },
};

function mem(id: string, text: string, charId = "c-lan"): Memory {
  return {
    id,
    instanceId: "w-test",
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

describe("reconcileGodEditMemories", () => {
  it("adds a supersession memory for witnesses of a rewritten fact", () => {
    const out = reconcileGodEditMemories({
      before: state,
      committed: [{ kind: "setFact", id: "f-god", field: "truth", value: "阿岚是王女", hardness: "core" }],
      memories: [mem("m-old", "我亲眼确认过：阿岚是掌柜。")],
      now: () => 10,
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      instanceId: "w-test",
      charId: "c-lan",
      kind: "reflection",
      provenance: "authored",
      evidence: ["m-old"],
    });
    expect(out[0].text).toContain("阿岚是掌柜");
    expect(out[0].text).toContain("阿岚是王女");
    expect(out[0].text).not.toMatch(/上帝|God|编辑|改写/);
    expect(out[0].interpretation ?? "").not.toMatch(/god|edit|superseded/i);
    expect(out[0].distortion).toBeUndefined();
  });

  it("does nothing when a God Edit creates a new fact instead of revising an old one", () => {
    const out = reconcileGodEditMemories({
      before: { ...state, facts: [] },
      committed: [{ kind: "setFact", id: "f-god", field: "truth", value: "阿岚是王女", hardness: "core" }],
      memories: [mem("m-old", "我亲眼确认过：阿岚是掌柜。")],
    });

    expect(out).toEqual([]);
  });

  it("does not supersede memories that only share loose keywords with the old fact", () => {
    const out = reconcileGodEditMemories({
      before: state,
      committed: [{ kind: "setFact", id: "f-god", field: "truth", value: "阿岚是王女", hardness: "core" }],
      memories: [
        mem("m-loose", "阿岚站在门口，没有提自己的身份。"),
        mem("m-exact", "我亲眼确认过：阿岚是掌柜。"),
      ],
      now: () => 10,
    });

    expect(out).toHaveLength(1);
    expect(out[0].evidence).toEqual(["m-exact"]);
  });

  it("does not supersede entity facts from old-value-only environmental mentions", () => {
    const before: WorldState = {
      ...state,
      facts: [{ id: "f-key", entityId: "o-key", field: "hidden", value: "地板下", hardness: "anchored", sinceDay: 1 }],
    };

    const out = reconcileGodEditMemories({
      before,
      committed: [{ kind: "setFact", id: "f-key-god", entityId: "o-key", field: "hidden", value: "阿岚的口袋", hardness: "core" }],
      memories: [
        mem("m-key", "我亲眼看见铜钥匙被藏在地板下。", "c-lan"),
        mem("m-floor", "地板下很潮，老鼠会在那里作响。", "c-zhou"),
      ],
      now: () => 15,
    });

    expect(out).toHaveLength(1);
    expect(out[0].charId).toBe("c-lan");
    expect(out[0].evidence).toEqual(["m-key"]);
  });

  it("adds a supersession memory for witnesses of a rewritten condition", () => {
    const before: WorldState = {
      ...state,
      roster: { ...state.roster, "c-lan": { name: "阿岚", condition: "左手受伤" } },
    };

    const out = reconcileGodEditMemories({
      before,
      committed: [{ kind: "setCondition", entityId: "c-lan", condition: "左手完好" }],
      memories: [mem("m-condition", "我亲眼看见阿岚左手受伤。")],
      now: () => 20,
      branchId: "br-test",
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      instanceId: "w-test",
      charId: "c-lan",
      kind: "reflection",
      provenance: "authored",
      evidence: ["m-condition"],
      branchId: "br-test",
    });
    expect(out[0].text).toContain("左手受伤");
    expect(out[0].text).toContain("左手完好");
  });

  it("supersedes condition memories that paraphrase the old state with subject support", () => {
    const before: WorldState = {
      ...state,
      roster: { ...state.roster, "c-lan": { name: "阿岚", condition: "左手受伤" } },
    };

    const out = reconcileGodEditMemories({
      before,
      committed: [{ kind: "setCondition", entityId: "c-lan", condition: "左手完好" }],
      memories: [
        mem("m-paraphrase", "阿岚的左手缠着绷带，拿杯子时明显避痛。"),
        mem("m-loose", "阿岚左手拿着杯子，神色平静。", "c-zhou"),
      ],
      now: () => 22,
    });

    expect(out).toHaveLength(1);
    expect(out[0].evidence).toEqual(["m-paraphrase"]);
    expect(out[0].text).toContain("左手受伤");
    expect(out[0].text).toContain("左手完好");
  });

  it("adds a supersession memory for witnesses of a rewritten relationship stance", () => {
    const out = reconcileGodEditMemories({
      before: state,
      committed: [{ kind: "setRelationship", fromId: "c-lan", toId: "you", disposition: "戒备你", affinityDelta: -60, reason: "发现你撒谎" }],
      memories: [
        mem("m-relation", "我记得阿岚信任你。"),
        mem("m-loose", "阿岚问过你是谁。"),
      ],
      now: () => 30,
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      instanceId: "w-test",
      charId: "c-lan",
      kind: "reflection",
      provenance: "authored",
      evidence: ["m-relation"],
    });
    expect(out[0].text).toContain("信任你");
    expect(out[0].text).toContain("戒备你");
  });

  it("supersedes relationship memories that paraphrase the old stance with subject support", () => {
    const out = reconcileGodEditMemories({
      before: state,
      committed: [{ kind: "setRelationship", fromId: "c-lan", toId: "you", disposition: "戒备你", affinityDelta: -60, reason: "发现你撒谎" }],
      memories: [
        mem("m-relation-paraphrase", "阿岚把你当成自己人，还愿意把后门钥匙交给你。"),
        mem("m-relation-loose", "阿岚问你是谁，手指停在杯沿。", "c-zhou"),
      ],
      now: () => 35,
    });

    expect(out).toHaveLength(1);
    expect(out[0].evidence).toEqual(["m-relation-paraphrase"]);
    expect(out[0].text).toContain("信任你");
    expect(out[0].text).toContain("戒备你");
  });
});
