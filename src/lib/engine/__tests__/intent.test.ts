import { describe, it, expect } from "vitest";
import { parseIntent, decideIntent } from "../intent";
import { DEMO_SEED } from "../../world/seed-demo";
import type { ChatMessage } from "../../types";

describe("parseIntent", () => {
  it("parses a valid intent JSON", () => {
    expect(parseIntent('好的 {"action":"speak","eagerness":0.8} 结束')).toEqual({
      action: "speak",
      eagerness: 0.8,
    });
  });

  it("clamps eagerness and defaults to safe pass on garbage", () => {
    expect(parseIntent("胡言乱语没有json")).toEqual({ action: "pass", eagerness: 0 });
    expect(parseIntent('{"action":"speak","eagerness":5}').eagerness).toBe(1);
  });
});

describe("decideIntent", () => {
  it("returns the parsed intent from the llm; safe-pass on llm error", async () => {
    const c = DEMO_SEED.characters[0];
    const okLlm = async (_m: ChatMessage[]) => ({ content: '{"action":"speak","eagerness":0.6}' });
    const r = await decideIntent({
      seed: DEMO_SEED,
      state: DEMO_SEED.openingState,
      character: c,
      recent: [],
      llm: okLlm,
    });
    expect(r).toEqual({ action: "speak", eagerness: 0.6 });

    const badLlm = async () => {
      throw new Error("boom");
    };
    const r2 = await decideIntent({
      seed: DEMO_SEED,
      state: DEMO_SEED.openingState,
      character: c,
      recent: [],
      llm: badLlm,
    });
    expect(r2).toEqual({ action: "pass", eagerness: 0 });
  });
});
