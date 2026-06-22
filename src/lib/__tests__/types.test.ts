import { describe, it, expect } from "vitest";
import type { WorldState } from "../types";

describe("types", () => {
  it("WorldState shape is usable", () => {
    const s: WorldState = {
      currentLocationId: "loc-1",
      time: { day: 1, clock: "黄昏", lighting: "暖橙" },
      locations: { "loc-1": { id: "loc-1", name: "酒馆", detail: "fleshed", gist: "昏黄的酒馆", connections: [], presentCharacterIds: ["c-1"], objectIds: [] } },
      objects: {},
      roster: { "c-1": { name: "阿岚" } },
      flags: {},
    };
    expect(s.locations["loc-1"].presentCharacterIds).toContain("c-1");
  });
});
