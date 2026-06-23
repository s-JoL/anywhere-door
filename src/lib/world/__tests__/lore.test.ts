import { describe, it, expect } from "vitest";
import { retrieveLore, formatLore } from "../lore";
import type { LoreEntry } from "../../types";

const LORE: LoreEntry[] = [
  { id: "l1", keys: ["血誓录", "禁书"], content: "一本记载血誓的禁书，触之者必偿。" },
  { id: "l2", keys: ["Order", "圣堂"], content: "圣堂骑士团世代守护这座城。" },
  { id: "l3", keys: ["雪莲"], content: "雪莲是十年前消失的剑客化名。" },
  { id: "l4", keys: ["孤山"], content: "孤山每逢大雪便与世隔绝。" },
  { id: "l5", keys: ["北境"], content: "北境苦寒，门派林立。" },
];

describe("retrieveLore", () => {
  it("matches a CJK key appearing in the text", () => {
    const out = retrieveLore("她从怀里掏出那本血誓录。", LORE);
    expect(out.map((e) => e.id)).toEqual(["l1"]);
  });

  it("matches an ASCII key case-insensitively", () => {
    const out = retrieveLore("He whispered the word ORDER under his breath.", LORE);
    expect(out.map((e) => e.id)).toEqual(["l2"]);
  });

  it("matches if ANY key appears", () => {
    const out = retrieveLore("圣堂的钟声响起。", LORE);
    expect(out.map((e) => e.id)).toEqual(["l2"]);
  });

  it("dedups by id when multiple keys of the same entry match", () => {
    const out = retrieveLore("血誓录其实就是那本禁书。", LORE);
    expect(out.map((e) => e.id)).toEqual(["l1"]);
  });

  it("preserves lore order across multiple matches", () => {
    const out = retrieveLore("北境的孤山上，雪莲手持血誓录。", LORE);
    // lore order: l1, l3, l4, l5
    expect(out.map((e) => e.id)).toEqual(["l1", "l3", "l4", "l5"]);
  });

  it("caps the number of returned entries", () => {
    const out = retrieveLore("北境的孤山上，雪莲手持血誓录。", LORE, 2);
    expect(out).toHaveLength(2);
    expect(out.map((e) => e.id)).toEqual(["l1", "l3"]);
  });

  it("defaults the cap to 4", () => {
    const out = retrieveLore("北境的孤山上，雪莲手持血誓录，圣堂在望。", LORE);
    expect(out).toHaveLength(4);
  });

  it("returns [] on no match", () => {
    expect(retrieveLore("一片祥和，什么都没有发生。", LORE)).toEqual([]);
  });

  it("returns [] on empty / undefined lore", () => {
    expect(retrieveLore("血誓录", undefined)).toEqual([]);
    expect(retrieveLore("血誓录", [])).toEqual([]);
  });

  it("returns [] on empty text", () => {
    expect(retrieveLore("", LORE)).toEqual([]);
  });

  it("ignores entries with empty keys safely", () => {
    const lore: LoreEntry[] = [{ id: "x", keys: [], content: "无键" }];
    expect(retrieveLore("任何文字", lore)).toEqual([]);
  });
});

describe("formatLore", () => {
  it("renders keys and content for non-empty entries", () => {
    const out = formatLore([LORE[0], LORE[2]]);
    expect(out).toContain("【世界设定】");
    expect(out).toContain("血誓录");
    expect(out).toContain("一本记载血誓的禁书，触之者必偿。");
    expect(out).toContain("雪莲");
    expect(out).toContain("雪莲是十年前消失的剑客化名。");
  });

  it("returns empty string for empty entries", () => {
    expect(formatLore([])).toBe("");
  });
});
