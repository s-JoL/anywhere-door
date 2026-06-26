import { describe, expect, it } from "vitest";
import { formatBeliefLine } from "../display";

describe("formatBeliefLine", () => {
  it("includes subjective evidence text when a belief edge has it", () => {
    expect(formatBeliefLine({
      observerName: "老周",
      stance: "wrong",
      factLabel: "c-lan.truth = 王女",
      evidenceText: "老周：我确信阿岚是逃犯，不是什么王女。",
    })).toBe("老周: wrong c-lan.truth = 王女 · 老周：我确信阿岚是逃犯，不是什么王女。");
  });

  it("keeps the compact line when no evidence text is available", () => {
    expect(formatBeliefLine({
      observerName: "阿岚",
      stance: "knows",
      factLabel: "o-key.hidden = 地板下",
    })).toBe("阿岚: knows o-key.hidden = 地板下");
  });
});
