import { describe, expect, it } from "vitest";
import { formatNarrationSourceSnapshot } from "../narration";
import { DEMO_SEED } from "../seed-demo";

describe("formatNarrationSourceSnapshot", () => {
  it("does not leak hidden fact values unless they are player-known", () => {
    const state = {
      ...DEMO_SEED.openingState,
      facts: [
        {
          id: "f-hidden",
          entityId: "o-ledger",
          field: "hidden",
          value: "地板下第三块砖",
          hardness: "anchored" as const,
        },
        {
          id: "f-known",
          entityId: "o-lamp",
          field: "state",
          value: "灯芯被你剪短",
          hardness: "anchored" as const,
          playerKnown: true,
        },
      ],
    };

    const snapshot = formatNarrationSourceSnapshot(state);

    expect(snapshot).not.toContain("地板下第三块砖");
    expect(snapshot).toContain("灯芯被你剪短");
  });

  it("does not leak not-yet-known pressure thread summaries or next signs", () => {
    const state = {
      ...DEMO_SEED.openingState,
      pressureLines: [
        {
          id: "known-debt",
          summary: "收账人会再来",
          status: "active" as const,
          intensity: 6,
          playerKnown: true,
          nextSign: "门外有人敲三下",
        },
        {
          id: "hidden-well",
          summary: "井下的旧神醒了",
          status: "active" as const,
          intensity: 9,
          playerKnown: false,
          nextSign: "井口泛起红光",
        },
      ],
    };

    const snapshot = formatNarrationSourceSnapshot(state);

    expect(snapshot).toContain("收账人会再来");
    expect(snapshot).toContain("门外有人敲三下");
    expect(snapshot).not.toContain("井下的旧神醒了");
    expect(snapshot).not.toContain("井口泛起红光");
    expect(snapshot).toContain("unknown pressure");
  });
});
