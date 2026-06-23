import { describe, it, expect } from "vitest";
import { updateTension, directorNarrate, maybeDirect } from "../director";
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

describe("maybeDirect", () => {
  const state: WorldState = {
    currentLocationId: "bar", time: { day: 1, clock: "深夜", lighting: "冷光" },
    locations: { bar: { id: "bar", name: "酒馆", detail: "fleshed", gist: "", connections: [], presentCharacterIds: [], objectIds: [] } },
    objects: {}, roster: {}, flags: {},
  };
  const llm = async (_m: ChatMessage[]) => ({ content: "雨声忽然变急。" });
  const base = { instanceId: "i1", state, recentLines: ["你：……"], llm };

  it("narrates on a clear tension jump (>=1.5) from low", async () => {
    const beat = await maybeDirect({ ...base, tensionBefore: 2, tensionAfter: 4 });
    expect(beat).not.toBeNull();
    expect(beat?.narration).toBe(true);
  });

  it("narrates while tension is high and still climbing, even without a 1.5 jump", async () => {
    const beat = await maybeDirect({ ...base, tensionBefore: 7, tensionAfter: 8 });
    expect(beat).not.toBeNull();
  });

  it("stays silent when tension is high but flat/decaying (anti-spam)", async () => {
    expect(await maybeDirect({ ...base, tensionBefore: 8, tensionAfter: 8 })).toBeNull();
    expect(await maybeDirect({ ...base, tensionBefore: 9, tensionAfter: 7 })).toBeNull();
  });

  it("stays silent on a calm, low, barely-moving turn", async () => {
    expect(await maybeDirect({ ...base, tensionBefore: 1, tensionAfter: 1.5 })).toBeNull();
  });
});
