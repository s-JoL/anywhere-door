import { describe, it, expect, beforeEach } from "vitest";
import { ensureDemoInstance } from "../bootstrap";
import { getRepository, resetRepository } from "../../storage";

describe("ensureDemoInstance", () => {
  beforeEach(() => { resetRepository(); indexedDB.deleteDatabase("the-reveries"); });
  it("creates the demo instance once and reuses it", async () => {
    const a = await ensureDemoInstance();
    const b = await ensureDemoInstance();
    expect(a).toBe(b);
    expect(await getRepository().getInstance(a)).toBeDefined();
  });
});
