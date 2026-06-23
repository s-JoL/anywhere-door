import { describe, it, expect } from "vitest";
import { buildFleshPrompt, fleshStubLocation } from "../flesh";
import type { WorldSeed, Location, ChatMessage } from "../../types";

const seed = { worldview: "雨夜赛博都市，霓虹与债务" } as WorldSeed;
const stub: Location = {
  id: "alley", name: "后巷", detail: "stub", gist: "湿冷的死胡同",
  connections: [], presentCharacterIds: [], objectIds: [],
};

describe("buildFleshPrompt", () => {
  it("includes worldview, location name and gist", () => {
    const all = buildFleshPrompt(seed, stub).map((m) => m.content).join("\n");
    expect(all).toContain("雨夜赛博都市");
    expect(all).toContain("后巷");
    expect(all).toContain("湿冷的死胡同");
  });
});

describe("fleshStubLocation", () => {
  it("returns a fleshLocation delta carrying the llm's description", async () => {
    const llm = async (_m: ChatMessage[]) => ({ content: "  霓虹在积水里碎成红蓝两色，排水管在滴。  " });
    const d = await fleshStubLocation(seed, stub, llm);
    expect(d).toEqual({ kind: "fleshLocation", locationId: "alley", description: "霓虹在积水里碎成红蓝两色，排水管在滴。" });
  });
  it("returns null on empty content or llm error (graceful degrade)", async () => {
    expect(await fleshStubLocation(seed, stub, async () => ({ content: "   " }))).toBeNull();
    expect(await fleshStubLocation(seed, stub, async () => { throw new Error("x"); })).toBeNull();
  });
});
