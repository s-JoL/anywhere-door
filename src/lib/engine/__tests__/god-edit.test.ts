import { describe, expect, it } from "vitest";
import { parseGodEditDeltas } from "../god-edit";

describe("parseGodEditDeltas", () => {
  it("accepts a single JSON delta", () => {
    const deltas = parseGodEditDeltas('{"kind":"setFact","id":"f-god","field":"truth","value":"阿岚是王女","hardness":"core"}');
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ kind: "setFact", hardness: "core" });
  });

  it("accepts a JSON array and fenced JSON", () => {
    const deltas = parseGodEditDeltas('```json\n[{"kind":"advanceTime","clock":"深夜"}]\n```');
    expect(deltas).toEqual([{ kind: "advanceTime", clock: "深夜" }]);
  });

  it("rejects malformed or empty edits", () => {
    expect(() => parseGodEditDeltas("not json")).toThrow(/JSON/);
    expect(() => parseGodEditDeltas("[]")).toThrow(/至少/);
    expect(() => parseGodEditDeltas('{"field":"truth"}')).toThrow(/kind/);
    expect(() => parseGodEditDeltas('{"kind":"unknownDelta","id":"x"}')).toThrow(/unknownDelta/);
  });
});
