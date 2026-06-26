import type { ModelConfig, ProviderId, WorldSeed } from "@/lib/types";
import { isValidProvider } from "@/lib/llm/providers";

/** The user's own global model config (same shape as a single world's modelConfig). */
export type UserConfig = ModelConfig;

const KEY = "anywhere-door.userConfig";
const LEGACY_KEY = "anymen.userConfig";

export const MODEL_SUGGESTIONS: Record<ProviderId, string[]> = {
  openrouter: ["deepseek/deepseek-v4-pro", "deepseek/deepseek-chat", "google/gemini-2.5-flash"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
};

export const DEFAULT_USER_CONFIG: UserConfig = {
  provider: "openrouter",
  apiKey: "",
  model: MODEL_SUGGESTIONS.openrouter[0],
  reasoningEnabled: false,
};

export function defaultModelForProvider(provider: ProviderId): string {
  return MODEL_SUGGESTIONS[provider][0];
}

function isLikelyProviderModel(provider: ProviderId, model: string): boolean {
  const trimmed = model.trim();
  if (!trimmed) return false;
  if (MODEL_SUGGESTIONS[provider].includes(trimmed)) return true;
  if (provider === "openrouter") return trimmed.includes("/");
  return !trimmed.includes("/") && trimmed.startsWith("deepseek-");
}

export function applyProviderDefaults(current: UserConfig, provider: ProviderId): UserConfig {
  return {
    ...current,
    provider,
    model: defaultModelForProvider(provider),
    reasoningEnabled: provider === "openrouter" ? current.reasoningEnabled : false,
  };
}

export function normalizeUserConfig(config: UserConfig): UserConfig {
  const provider = config.provider;
  return {
    provider,
    apiKey: config.apiKey.trim(),
    model: isLikelyProviderModel(provider, config.model)
      ? config.model.trim()
      : defaultModelForProvider(provider),
    reasoningEnabled: provider === "openrouter" ? config.reasoningEnabled : false,
  };
}

function hasRealUserKey(config: UserConfig): boolean {
  return config.apiKey.trim().length > 0;
}

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
      if (!isUserConfig(parsed)) return null;
      const normalized = normalizeUserConfig(parsed);
      if (!hasRealUserKey(normalized)) {
        localStorage.removeItem(KEY);
        return null;
      }
      return normalized;
    }

    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return null;
    const legacyParsed: unknown = JSON.parse(legacyRaw);
    if (!isUserConfig(legacyParsed)) return null;
    const migrated = normalizeUserConfig(legacyParsed);
    if (!hasRealUserKey(migrated)) {
      localStorage.removeItem(LEGACY_KEY);
      return null;
    }
    localStorage.setItem(KEY, JSON.stringify(migrated));
    localStorage.removeItem(LEGACY_KEY);
    return migrated;
  } catch {
    return null;
  }
}

/** Write the local config. Touches only localStorage. */
export function setUserConfig(c: UserConfig): void {
  const normalized = normalizeUserConfig(c);
  if (!hasRealUserKey(normalized)) {
    clearUserConfig();
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(normalized));
  localStorage.removeItem(LEGACY_KEY);
}

/** Clear the local config. */
export function clearUserConfig(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem(LEGACY_KEY);
}

/**
 * Pure function: decide which model config a given world actually uses.
 * - If a user config exists → use the user's key/model (drives every reactive world).
 * - Otherwise → fall back to the world's provider/model with an empty key (dev env may provide a server fallback, but the seed never does).
 *
 * Seeds are content records, not secret stores. Historical/imported seeds may
 * carry an apiKey field, but runtime must strip it at the read boundary.
 */
export function resolveModelConfig(seed: WorldSeed, user: UserConfig | null): ModelConfig {
  if (user && hasRealUserKey(user)) {
    const normalized = normalizeUserConfig(user);
    return {
      provider: normalized.provider,
      apiKey: normalized.apiKey,
      model: normalized.model,
      reasoningEnabled: normalized.reasoningEnabled,
    };
  }
  return { ...seed.modelConfig, apiKey: "" };
}
