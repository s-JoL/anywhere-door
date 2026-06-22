import { describe, it, expect } from "vitest";
import { scoreMemories } from "../retrieve";
import { keywordsOf } from "../keywords";
import type { Memory } from "../../types";

function m(id: string, text: string, importance: number, createdAt: number): Memory {
  return { id, charId: "c1", kind: "observation", text, keywords: keywordsOf(text), importance, createdAt, lastAccessed: createdAt };
}

describe("scoreMemories", () => {
  const mems: Memory[] = [
    m("relevant_recent", "你在酒馆点了一杯威士忌", 6, 100),
    m("relevant_old", "酒馆里有人提到威士忌", 5, 1),
    m("irrelevant_recent", "窗外的雨下个不停", 4, 99),
    m("irrelevant_old", "码头停着一艘旧船", 3, 2),
  ];

  it("ranks a relevant+recent+important memory first", () => {
    const top = scoreMemories(mems, keywordsOf("再来一杯威士忌"), { topK: 4 });
    expect(top[0].id).toBe("relevant_recent");
  });

  it("respects topK", () => {
    const top = scoreMemories(mems, keywordsOf("威士忌"), { topK: 2 });
    expect(top.length).toBe(2);
    expect(top.map((x) => x.id)).toContain("relevant_recent");
  });

  it("returns [] for no memories", () => {
    expect(scoreMemories([], keywordsOf("任何"))).toEqual([]);
  });
});
