import { describe, it, expect } from "vitest";
import { parseSseChunks, extractDelta } from "../sse";

describe("sse parsing", () => {
  it("splits complete events and keeps the remainder", () => {
    const { events, rest } = parseSseChunks("data: a\n\ndata: b\n\ndata: par");
    expect(events).toEqual(["data: a", "data: b"]);
    expect(rest).toBe("data: par");
  });
  it("extracts content delta from an openai-style line", () => {
    const line = 'data: {"choices":[{"delta":{"content":"你好"}}]}';
    expect(extractDelta(line)).toBe("你好");
  });
  it("returns empty for [DONE] and non-content lines", () => {
    expect(extractDelta("data: [DONE]")).toBe("");
  });
});
