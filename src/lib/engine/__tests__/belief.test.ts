import { describe, it, expect } from "vitest";
import { beliefOf, assembleBeliefGraph } from "../belief";
import type { Fact, Memory } from "../../types";

const fact: Fact = { id: "f1", entityId: "杀手", field: "location", value: "后巷", hardness: "anchored" };

const mem = (over: Partial<Memory>): Memory => ({
  id: "m", instanceId: "w-test", charId: "c1", kind: "observation", text: "杀手 在 后巷", keywords: ["杀手", "后巷"],
  importance: 6, createdAt: 1, lastAccessed: 1, ...over,
});

describe("§5.3 beliefOf — stance derivation", () => {
  it("unaware when no memory references the fact", () => {
    const e = beliefOf("c1", fact, [mem({ text: "天气不错", keywords: ["天气"] })]);
    expect(e.stance).toBe("unaware");
    expect(e.evidence).toEqual([]);
  });

  it("knows from a witnessed high-confidence reference", () => {
    const e = beliefOf("c1", fact, [mem({ id: "ok", provenance: "witnessed", confidence: 1 })]);
    expect(e.stance).toBe("knows");
    expect(e.evidence).toContain("ok");
  });

  it("believes from heard (second-hand) reference", () => {
    const e = beliefOf("c1", fact, [mem({ id: "h", provenance: "heard", confidence: 0.6 })]);
    expect(e.stance).toBe("believes");
  });

  it("suspects when only low-confidence references exist", () => {
    const e = beliefOf("c1", fact, [mem({ id: "low", provenance: "heard", confidence: 0.3 })]);
    expect(e.stance).toBe("suspects");
  });

  it("wrong when a referencing memory is garbled or distorted", () => {
    const e = beliefOf("c1", fact, [mem({ id: "bad", provenance: "witnessed", confidence: 1, perceptionQuality: "garbled" })]);
    expect(e.stance).toBe("wrong");
    const e2 = beliefOf("c1", fact, [mem({ id: "d", provenance: "heard", confidence: 0.6, distortion: "记成了前门" })]);
    expect(e2.stance).toBe("wrong");
  });

  it("picks the strongest supporting memory's confidence", () => {
    const e = beliefOf("c1", fact, [
      mem({ id: "a", provenance: "heard", confidence: 0.4 }),
      mem({ id: "b", provenance: "witnessed", confidence: 0.95 }),
    ]);
    expect(e.confidence).toBe(0.95);
    expect(e.stance).toBe("knows");
  });
});

describe("§5.3 assembleBeliefGraph — read view, observers × facts", () => {
  it("yields per-observer stances and omits unaware edges", () => {
    const facts: Fact[] = [fact, { id: "f2", entityId: "门", field: "state", value: "锁死", hardness: "ambient" }];
    const graph = assembleBeliefGraph({
      facts,
      observers: ["c1", "c2"],
      memoriesByObserver: {
        c1: [mem({ id: "c1m", provenance: "witnessed", confidence: 1 })], // knows f1, unaware f2
        c2: [mem({ id: "c2m", text: "门 锁死 了", keywords: ["门", "锁死"], provenance: "heard", confidence: 0.6 })], // believes f2
      },
    });
    const c1 = graph.filter((e) => e.observerId === "c1");
    expect(c1).toHaveLength(1); // only f1; f2 unaware is omitted
    expect(c1[0]).toMatchObject({ factId: "f1", stance: "knows" });
    const c2 = graph.find((e) => e.observerId === "c2" && e.factId === "f2");
    expect(c2?.stance).toBe("believes");
  });

  it("is a pure read view — it returns edges without mutating inputs", () => {
    const facts = [fact];
    const memos = { c1: [mem({ provenance: "witnessed", confidence: 1 })] };
    const before = JSON.parse(JSON.stringify({ facts, memos }));
    assembleBeliefGraph({ facts, observers: ["c1"], memoriesByObserver: memos });
    expect({ facts, memos }).toEqual(before);
  });
});
