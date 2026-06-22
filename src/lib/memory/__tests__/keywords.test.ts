import { describe, it, expect } from "vitest";
import { keywordsOf, relevance } from "../keywords";

describe("keywordsOf", () => {
  it("extracts CJK single chars and latin words, drops stopwords, dedups", () => {
    const kw = keywordsOf("我推门走进酒馆 the BAR");
    expect(kw).toContain("酒"); expect(kw).toContain("馆");
    expect(kw).toContain("the"); expect(kw).toContain("bar"); // lowercased
    expect(kw).not.toContain("我"); // stopword
    expect(new Set(kw).size).toBe(kw.length); // deduped
  });
});

describe("relevance", () => {
  it("counts shared features", () => {
    expect(relevance(["酒", "馆", "雨"], ["酒", "馆"])).toBe(2);
    expect(relevance(["雨"], ["酒"])).toBe(0);
  });
});
