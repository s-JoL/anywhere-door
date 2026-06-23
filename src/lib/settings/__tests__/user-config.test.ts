import { describe, it, expect, beforeEach } from "vitest";
import { getUserConfig, setUserConfig, clearUserConfig, resolveModelConfig, type UserConfig } from "../user-config";
import type { WorldSeed } from "@/lib/types";

const USER: UserConfig = { provider: "deepseek", apiKey: "user-key", model: "deepseek-v4-flash", reasoningEnabled: true };
const KEY = "anywhere-door.userConfig";
const LEGACY_KEY = "anymen.userConfig";

function seedWith(source: WorldSeed["source"], apiKey: string): WorldSeed {
  return {
    id: "s",
    title: "t",
    worldview: "w",
    rules: { physics: "", setting: "", redLines: [] },
    openingState: {
      currentLocationId: "loc",
      time: { day: 1, clock: "", lighting: "" },
      locations: {},
      objects: {},
      roster: {},
      flags: {},
    },
    characters: [],
    modelConfig: { provider: "openrouter", apiKey, model: "deepseek/deepseek-v4-pro", reasoningEnabled: false },
    source,
  };
}

describe("user-config storage", () => {
  beforeEach(() => localStorage.clear());

  it("get/set/clear roundtrip", () => {
    expect(getUserConfig()).toBeNull();
    setUserConfig(USER);
    expect(getUserConfig()).toEqual(USER);
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify(USER));
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    clearUserConfig();
    expect(getUserConfig()).toBeNull();
  });

  it("getUserConfig returns null on empty", () => {
    expect(getUserConfig()).toBeNull();
  });

  it("getUserConfig returns null on garbage", () => {
    localStorage.setItem(KEY, "{not json");
    expect(getUserConfig()).toBeNull();
  });

  it("getUserConfig returns null on structurally-invalid value", () => {
    localStorage.setItem(KEY, JSON.stringify({ provider: "openrouter" }));
    expect(getUserConfig()).toBeNull();
  });

  it("migrates a valid legacy key to the Anywhere Door key", () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(USER));
    expect(getUserConfig()).toEqual(USER);
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify(USER));
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("clearUserConfig removes both current and legacy keys", () => {
    localStorage.setItem(KEY, JSON.stringify(USER));
    localStorage.setItem(LEGACY_KEY, JSON.stringify(USER));
    clearUserConfig();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });
});

describe("resolveModelConfig", () => {
  it("builtin seed + user set → user's config", () => {
    const cfg = resolveModelConfig(seedWith("builtin", ""), USER);
    expect(cfg).toEqual({ provider: "deepseek", apiKey: "user-key", model: "deepseek-v4-flash", reasoningEnabled: true });
  });

  it("generated seed + user set → user's config", () => {
    const cfg = resolveModelConfig(seedWith("generated", ""), USER);
    expect(cfg.apiKey).toBe("user-key");
  });

  it("builtin seed + no user → seed's config (dev env fallback, key may be empty)", () => {
    const cfg = resolveModelConfig(seedWith("builtin", ""), null);
    expect(cfg).toEqual({ provider: "openrouter", apiKey: "", model: "deepseek/deepseek-v4-pro", reasoningEnabled: false });
  });

  it("creator seed with its own real key → seed's config even when user set (creator pays)", () => {
    const cfg = resolveModelConfig(seedWith("created", "creator-key"), USER);
    expect(cfg.apiKey).toBe("creator-key");
    expect(cfg.provider).toBe("openrouter");
  });

  it("creator seed with no key + user set → user's config", () => {
    const cfg = resolveModelConfig(seedWith("created", ""), USER);
    expect(cfg.apiKey).toBe("user-key");
  });

  it("creator seed with own key + no user → seed's config", () => {
    const cfg = resolveModelConfig(seedWith("imported", "creator-key"), null);
    expect(cfg.apiKey).toBe("creator-key");
  });
});
