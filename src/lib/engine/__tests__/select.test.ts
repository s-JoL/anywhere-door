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

  it("returns empty for no candidates", () => {
    expect(selectSpeakers([], 2)).toEqual({ ids: [], forced: false });
  });
});
