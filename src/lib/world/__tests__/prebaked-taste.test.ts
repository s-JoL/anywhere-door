import { describe, expect, it } from "vitest";
import { DEMO_SEED } from "../seed-demo";
import {
  composePrebakedTasteLines,
  hasUserSuppliedModelKey,
  shouldUsePrebakedTaste,
} from "../prebaked-taste";
import type { UserConfig } from "@/lib/settings/user-config";

const USER_CONFIG: UserConfig = {
  provider: "openrouter",
  apiKey: "user-key",
  model: "deepseek/deepseek-v4-pro",
  reasoningEnabled: false,
};

describe("pre-baked taste access model", () => {
  it("uses the scripted taste for a built-in world when the user has not supplied a key", () => {
    expect(shouldUsePrebakedTaste(DEMO_SEED, null)).toBe(true);
    expect(shouldUsePrebakedTaste(DEMO_SEED, { ...USER_CONFIG, apiKey: "   " })).toBe(true);
  });

  it("uses reactive play once the user has supplied a real key", () => {
    expect(shouldUsePrebakedTaste(DEMO_SEED, USER_CONFIG)).toBe(false);
  });

  it("does not use scripted taste for a generated world even if it has no user key", () => {
    expect(shouldUsePrebakedTaste({ ...DEMO_SEED, source: "generated" }, null)).toBe(false);
  });

  it("does not use scripted taste for a source-less seed even if it carries prebaked content", () => {
    const { source: _source, ...sourceLessSeed } = DEMO_SEED;
    expect(shouldUsePrebakedTaste(sourceLessSeed, null)).toBe(false);
  });

  it("recognizes only non-empty user keys as supplied keys", () => {
    expect(hasUserSuppliedModelKey(null)).toBe(false);
    expect(hasUserSuppliedModelKey({ ...USER_CONFIG, apiKey: "" })).toBe(false);
    expect(hasUserSuppliedModelKey(USER_CONFIG)).toBe(true);
  });

  it("composes the sample as the stored user action followed by scripted beats", () => {
    const lines = composePrebakedTasteLines(DEMO_SEED);
    expect(lines[0]).toEqual({
      kind: "user",
      content: DEMO_SEED.prebakedTaste!.userAction,
    });
    expect(lines.slice(1).length).toBe(DEMO_SEED.prebakedTaste!.beats.length);
    expect(lines.slice(1).some((line) => line.kind === "speaker" || line.kind === "narration")).toBe(true);
  });
});
