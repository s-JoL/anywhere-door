import { describe, expect, it } from "vitest";
import { classifyPlaySendGate, canRunLiveTurn, playAccessNotice, playControlSurface, settingsHrefForControlSurface } from "../access";
import { DEMO_SEED } from "@/lib/world/seed-demo";
import type { UserConfig } from "@/lib/settings/user-config";

const USER_CONFIG: UserConfig = {
  provider: "openrouter",
  apiKey: "user-key",
  model: "deepseek/deepseek-v4-pro",
  reasoningEnabled: false,
};

describe("play access state", () => {
  it("treats prebaked sample mode as its own blocked send state, not as missing-key state", () => {
    expect(classifyPlaySendGate({
      text: "我试着继续追问。",
      busy: false,
      hasInstance: true,
      hasSeed: true,
      prebakedMode: true,
      canRunLiveTurn: false,
    })).toBe("blocked-prebaked");
  });

  it("blocks non-prebaked live sends locally when there is no current model access", () => {
    expect(classifyPlaySendGate({
      text: "我继续问下去。",
      busy: false,
      hasInstance: true,
      hasSeed: true,
      prebakedMode: false,
      canRunLiveTurn: false,
    })).toBe("blocked-key");
  });

  it("allows generated/builtin live turns only with a current user key", () => {
    expect(canRunLiveTurn({ ...DEMO_SEED, source: "generated" }, null)).toBe(false);
    expect(canRunLiveTurn({ ...DEMO_SEED, source: "generated" }, USER_CONFIG)).toBe(true);
    expect(canRunLiveTurn(DEMO_SEED, null)).toBe(false);
    expect(canRunLiveTurn(DEMO_SEED, USER_CONFIG)).toBe(true);
  });

  it("does not treat a seed-embedded key as live model access", () => {
    expect(canRunLiveTurn({
      ...DEMO_SEED,
      source: "imported",
      modelConfig: { ...DEMO_SEED.modelConfig, apiKey: "embedded-secret" },
    }, null)).toBe(false);
  });

  it("shows only the sample notice when prebaked mode and needsKey are both true", () => {
    expect(playAccessNotice({ prebakedMode: true, needsKey: true })).toBe("sample");
  });

  it("replaces live controls with a key CTA in prebaked sample mode", () => {
    expect(playControlSurface({ prebakedMode: true, liveTurnAllowed: false })).toBe("sample-cta");
    expect(playControlSurface({ prebakedMode: true, liveTurnAllowed: true })).toBe("sample-cta");
  });

  it("preserves sample world context when the key CTA opens settings", () => {
    expect(settingsHrefForControlSurface("sample-cta", DEMO_SEED.id)).toBe(`/settings?from=prebaked-taste&world=${encodeURIComponent(DEMO_SEED.id)}`);
    expect(settingsHrefForControlSurface("key-cta", DEMO_SEED.id)).toBe("/settings");
    expect(settingsHrefForControlSurface("live-controls", DEMO_SEED.id)).toBe("/settings");
  });

  it("replaces live controls with a key CTA when a non-sample world has no model access", () => {
    expect(playControlSurface({ prebakedMode: false, liveTurnAllowed: false })).toBe("key-cta");
    expect(playControlSurface({ prebakedMode: false, liveTurnAllowed: true })).toBe("live-controls");
  });

  it("shows the missing-key notice only outside prebaked sample mode", () => {
    expect(playAccessNotice({ prebakedMode: false, needsKey: true })).toBe("needs-key");
    expect(playAccessNotice({ prebakedMode: false, needsKey: false })).toBeNull();
  });
});
