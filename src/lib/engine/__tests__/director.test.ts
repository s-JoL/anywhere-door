import { describe, it, expect } from "vitest";
import { updateTension, directorNarrate } from "../director";
import type { ChatMessage, WorldState } from "../../types";

describe("updateTension (pure)", () => {
  it("rises on charged/action lines, decays on calm, clamps 0..10", () => {
    expect(updateTension(2, "（拔枪）别动！")).toBeGreaterThan(2);
    expect(updateTension(5, "嗯，天气不错。")).toBeLessThan(5);
    expect(updateTension(10, "（开枪）！！")).toBeLessThanOrEqual(10);
    expect(updateTension(0, "……")).toBeGreaterThanOrEqual(0);
  });
});

describe("directorNarrate", () => {
  const state: WorldState = {
    currentLocationId: "bar", time: { day: 1, clock: "深夜", lighting: "冷光" },
    locations: { bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: [], presentCharacterIds: [], objectIds: [] } },
    objects: {}, roster: {}, flags: {},
  };
  it("returns a trimmed narration string from the llm", async () => {
    const llm = async (_m: ChatMessage[]) => ({ content: "  雨势更急了，霓虹在水洼里碎成一片血红。  " });
    expect(await directorNarrate({ state, recentLines: ["你：我推门进来"], llm })).toBe("雨势更急了，霓虹在水洼里碎成一片血红。");
  });
  it("returns null on empty content or llm error", async () => {
    expect(await directorNarrate({ state, recentLines: [], llm: async () => ({ content: "   " }) })).toBeNull();
    expect(await directorNarrate({ state, recentLines: [], llm: async () => { throw new Error("x"); } })).toBeNull();
  });
});
