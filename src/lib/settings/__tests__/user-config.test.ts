import { describe, it, expect, beforeEach } from "vitest";
import {
  applyProviderDefaults,
  clearUserConfig,
  DEFAULT_USER_CONFIG,
  getUserConfig,
  normalizeUserConfig,
  resolveModelConfig,
  setUserConfig,
  type UserConfig,
} from "../user-config";
import type { WorldSeed } from "@/lib/types";

const USER: UserConfig = { provider: "deepseek", apiKey: "user-key", model: "deepseek-v4-flash", reasoningEnabled: true };
const NORMALIZED_USER: UserConfig = { ...USER, reasoningEnabled: false };
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
    expect(getUserConfig()).toEqual(NORMALIZED_USER);
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify(NORMALIZED_USER));
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

  it("getUserConfig drops a persisted config without a real user key", () => {
    localStorage.setItem(KEY, JSON.stringify({ ...USER, apiKey: "   " }));
    expect(getUserConfig()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("setUserConfig clears storage instead of persisting an empty key", () => {
    localStorage.setItem(KEY, JSON.stringify(USER));
    setUserConfig({ ...USER, apiKey: "   " });
    expect(getUserConfig()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("migrates a valid legacy key to the Anywhere Door key", () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(USER));
    expect(getUserConfig()).toEqual(NORMALIZED_USER);
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify(NORMALIZED_USER));
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
    expect(cfg).toEqual({ provider: "deepseek", apiKey: "user-key", model: "deepseek-v4-flash", reasoningEnabled: false });
  });

  it("generated seed + user set → user's config", () => {
    const cfg = resolveModelConfig(seedWith("generated", ""), USER);
    expect(cfg.apiKey).toBe("user-key");
  });

  it("generated seed + no user never reuses a persisted seed key", () => {
    const cfg = resolveModelConfig(seedWith("generated", "stale-user-key"), null);
    expect(cfg.apiKey).toBe("");
    expect(cfg.model).toBe("deepseek/deepseek-v4-pro");
  });

  it("empty user key is treated as no user config", () => {
    const cfg = resolveModelConfig(seedWith("builtin", "seed-key"), { ...USER, apiKey: "   " });
    expect(cfg.apiKey).toBe("");
    expect(cfg.provider).toBe("openrouter");
  });

  it("source-less seeds cannot supply live model access without a current user key", () => {
    const { source: _source, ...sourceLessSeed } = seedWith("created", "seed-key");
    const cfg = resolveModelConfig(sourceLessSeed, null);
    expect(cfg.apiKey).toBe("");
  });

  it("builtin seed + no user → seed's config (dev env fallback, key may be empty)", () => {
    const cfg = resolveModelConfig(seedWith("builtin", ""), null);
    expect(cfg).toEqual({ provider: "openrouter", apiKey: "", model: "deepseek/deepseek-v4-pro", reasoningEnabled: false });
  });

  it("creator seed with its own real key still uses the user's current config when present", () => {
    const cfg = resolveModelConfig(seedWith("created", "creator-key"), USER);
    expect(cfg.apiKey).toBe("user-key");
    expect(cfg.provider).toBe("deepseek");
  });

  it("creator seed with no key + user set → user's config", () => {
    const cfg = resolveModelConfig(seedWith("created", ""), USER);
    expect(cfg.apiKey).toBe("user-key");
  });

  it("creator/imported seed with own key + no user strips the seed key", () => {
    const cfg = resolveModelConfig(seedWith("imported", "creator-key"), null);
    expect(cfg.apiKey).toBe("");
    expect(cfg.provider).toBe("openrouter");
  });
});

describe("settings provider defaults", () => {
  it("switching to DeepSeek resets the model to an official DeepSeek id and disables OpenRouter reasoning", () => {
    const current: UserConfig = {
      provider: "openrouter",
      apiKey: "key",
      model: "deepseek/deepseek-v4-pro",
      reasoningEnabled: true,
    };

    expect(applyProviderDefaults(current, "deepseek")).toEqual({
      provider: "deepseek",
      apiKey: "key",
      model: "deepseek-chat",
      reasoningEnabled: false,
    });
  });

  it("switching back to OpenRouter resets the model to the OpenRouter default", () => {
    const current: UserConfig = {
      provider: "deepseek",
      apiKey: "key",
      model: "deepseek-chat",
      reasoningEnabled: false,
    };

    expect(applyProviderDefaults(current, "openrouter")).toEqual({
      provider: "openrouter",
      apiKey: "key",
      model: "deepseek/deepseek-v4-pro",
      reasoningEnabled: false,
    });
  });

  it("normalizes stale DeepSeek configs that still carry OpenRouter-only state", () => {
    const stale: UserConfig = {
      provider: "deepseek",
      apiKey: "key",
      model: "deepseek/deepseek-v4-pro",
      reasoningEnabled: true,
    };

    expect(normalizeUserConfig(stale)).toEqual({
      provider: "deepseek",
      apiKey: "key",
      model: "deepseek-chat",
      reasoningEnabled: false,
    });
  });

  it("exposes one shared default config for the UI and reset path", () => {
    expect(DEFAULT_USER_CONFIG).toEqual({
      provider: "openrouter",
      apiKey: "",
      model: "deepseek/deepseek-v4-pro",
      reasoningEnabled: false,
    });
  });
});
