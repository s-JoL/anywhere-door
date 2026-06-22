import { describe, it, expect } from "vitest";
import { newId } from "../id";
import { nextTime } from "../clock";

describe("id & clock", () => {
  it("newId is unique and prefixed", () => {
    const a = newId("c"), b = newId("c");
    expect(a).not.toBe(b);
    expect(a.startsWith("c-")).toBe(true);
  });
  it("nextTime is monotonic", () => {
    const t1 = nextTime(), t2 = nextTime();
    expect(t2).toBeGreaterThan(t1);
  });
});
