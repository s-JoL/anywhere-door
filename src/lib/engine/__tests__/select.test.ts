import { describe, it, expect } from "vitest";
import { selectSpeakers } from "../select";

describe("selectSpeakers", () => {
  it("picks speakers by eagerness desc up to maxSpeakers, forced=false", () => {
    const sel = selectSpeakers([
      { id: "a", action: "speak", eagerness: 0.3 },
      { id: "b", action: "speak", eagerness: 0.9 },
      { id: "c", action: "pass", eagerness: 0.5 },
    ], 1);
    expect(sel).toEqual({ ids: ["b"], forced: false });
  });

  it("break-ice forces the single highest-eagerness when everyone passes", () => {
    const sel = selectSpeakers([
      { id: "a", action: "pass", eagerness: 0.2 },
      { id: "b", action: "pass", eagerness: 0.7 },
    ], 2);
    expect(sel).toEqual({ ids: ["b"], forced: true });
  });

  it("does not force a character who is actively avoiding the player to speak", () => {
    const sel = selectSpeakers([
      { id: "a", action: "avoid", eagerness: 0.9 },
      { id: "b", action: "pass", eagerness: 0.4 },
    ] as any, 2);
    expect(sel).toEqual({ ids: ["b"], forced: true });
  });

  it("keeps the most eager avoider visible when someone else speaks", () => {
    const sel = selectSpeakers([
      { id: "a", action: "speak", eagerness: 0.7 },
      { id: "b", action: "avoid", eagerness: 0.9 },
      { id: "c", action: "avoid", eagerness: 0.4 },
    ] as any, 1);
    expect(sel).toEqual({ ids: ["a"], forced: false, avoidIds: ["b"] });
  });

  it("surfaces avoidance when everyone avoids instead of forcing speech", () => {
    const sel = selectSpeakers([
      { id: "a", action: "avoid", eagerness: 0.9 },
      { id: "b", action: "avoid", eagerness: 0.4 },
    ] as any, 2);
    expect(sel).toEqual({ ids: [], forced: false, avoidIds: ["a"] });
  });

  it("returns empty for no candidates", () => {
    expect(selectSpeakers([], 2)).toEqual({ ids: [], forced: false });
  });
});
