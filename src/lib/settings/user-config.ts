import type { ModelConfig, WorldSeed } from "@/lib/types";
import { isValidProvider } from "@/lib/llm/providers";

/** The user's own global model config (same shape as a single world's modelConfig). */
export type UserConfig = ModelConfig;

const KEY = "anywhere-door.userConfig";
const LEGACY_KEY = "anymen.userConfig";

function isUserConfig(v: unknown): v is UserConfig {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    isValidProvider(o.provider) &&
    typeof o.apiKey === "string" &&
    typeof o.model === "string" &&
    typeof o.reasoningEnabled === "boolean"
  );
}

/** Read the local config; returns null if missing or corrupt. Touches only localStorage. */
export function getUserConfig(): UserConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      return isUserConfig(parsed) ? parsed : null;
    }

    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return null;
    const legacyParsed: unknown = JSON.parse(legacyRaw);
    if (!isUserConfig(legacyParsed)) return null;
    localStorage.setItem(KEY, JSON.stringify(legacyParsed));
    localStorage.removeItem(LEGACY_KEY);
    return legacyParsed;
  } catch {
    return null;
  }
}

/** Write the local config. Touches only localStorage. */
export function setUserConfig(c: UserConfig): void {
  localStorage.setItem(KEY, JSON.stringify(c));
  localStorage.removeItem(LEGACY_KEY);
}

/** Clear the local config. */
export function clearUserConfig(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem(LEGACY_KEY);
}

/**
 * Pure function: decide which model config a given world actually uses.
 * - A creator-authored world that carries a real key (source is not builtin/generated and apiKey is non-empty) → use the world's own config (the creator pays).
 * - Otherwise, if a user config exists → use the user's key/model (drives default and generated worlds).
 * - Otherwise → fall back to the world's own modelConfig (in dev, apiKey may be "" and the server env provides the fallback).
 */
export function resolveModelConfig(seed: WorldSeed, user: UserConfig | null): ModelConfig {
  const creatorAuthored = seed.source !== "builtin" && seed.source !== "generated";
  if (creatorAuthored && seed.modelConfig.apiKey.trim() !== "") {
    return seed.modelConfig;
  }
  if (user) {
    return {
      provider: user.provider,
      apiKey: user.apiKey,
      model: user.model,
      reasoningEnabled: user.reasoningEnabled,
    };
  }
  return seed.modelConfig;
}
