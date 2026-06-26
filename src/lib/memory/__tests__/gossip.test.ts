import { describe, it, expect } from "vitest";
import { propagateGossip } from "../gossip";
import type { Memory } from "../../types";

function obs(charId: string, text: string, importance: number): Memory {
  return { id: `${charId}-${text}`, instanceId: "w-test", charId, kind: "observation", text, keywords: [], importance, createdAt: 1, lastAccessed: 1 };
}

const present = [{ id: "a", name: "阿岚" }, { id: "b", name: "老周" }];

describe("propagateGossip (co-location gossip)", () => {
  it("a salient first-hand observation spreads to a co-present character as hearsay", () => {
    const recent = { a: [obs("a", "阿岚：那个背双刀的男人住进了隔壁", 8)], b: [] };
    const out = propagateGossip(present, recent, { instanceId: "w-test" });
    const toB = out.find((m) => m.charId === "b");
    expect(toB).toBeDefined();
    expect(toB!.instanceId).toBe("w-test");
    expect(toB!.kind).toBe("hearsay");
    expect(toB!.text).toContain("听阿岚");
    expect(toB!.text).toContain("背双刀的男人");
    expect(toB!.importance).toBeLessThan(8); // second-hand → down-weighted
  });

  it("does not spread low-importance idle chatter", () => {
    const recent = { a: [obs("a", "阿岚：今天天气不错", 3)], b: [] };
    expect(propagateGossip(present, recent, { instanceId: "w-test" })).toEqual([]);
  });

  it("does not re-tell a listener something they already heard (dedup)", () => {
    const text = "听阿岚提起：那个背双刀的男人住进了隔壁";
    const recent = {
      a: [obs("a", "阿岚：那个背双刀的男人住进了隔壁", 8)],
      b: [{ id: "b-old", instanceId: "w-test", charId: "b", kind: "hearsay" as const, text, keywords: [], importance: 5, createdAt: 1, lastAccessed: 1 }],
    };
    expect(propagateGossip(present, recent, { instanceId: "w-test" }).some((m) => m.charId === "b")).toBe(false);
  });

  it("does not re-propagate hearsay as if it were first-hand", () => {
    const recent = { a: [{ id: "a-h", instanceId: "w-test", charId: "a", kind: "hearsay" as const, text: "听别人说的事", keywords: [], importance: 9, createdAt: 1, lastAccessed: 1 }], b: [] };
    expect(propagateGossip(present, recent, { instanceId: "w-test" })).toEqual([]);
  });

  it("does not propagate inferred partial observations as first-hand gossip", () => {
    const recent = {
      a: [{
        ...obs("a", "你造成的后果：铜钥匙被你遮掩起来。", 9),
        provenance: "inferred" as const,
        confidence: 0.35,
        perceptionQuality: "partial" as const,
      }],
      b: [],
    };

    expect(propagateGossip(present, recent, { instanceId: "w-test", minImportance: 1 })).toEqual([]);
  });

  it("needs at least two co-present characters", () => {
    const recent = { a: [obs("a", "阿岚：大事发生了！", 9)] };
    expect(propagateGossip([{ id: "a", name: "阿岚" }], recent, { instanceId: "w-test" })).toEqual([]);
  });
});
