import type { ModelConfig, WorldSeed } from "@/lib/types";
import { isValidProvider } from "@/lib/llm/providers";

/** 用户自带的全局模型配置（与单个世界 modelConfig 同形）。 */
export type UserConfig = ModelConfig;

const KEY = "anymen.userConfig";

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

/** 读取本地配置；缺失或损坏返回 null。仅触碰 localStorage。 */
export function getUserConfig(): UserConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isUserConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 写入本地配置。仅触碰 localStorage。 */
export function setUserConfig(c: UserConfig): void {
  localStorage.setItem(KEY, JSON.stringify(c));
}

/** 清除本地配置。 */
export function clearUserConfig(): void {
  localStorage.removeItem(KEY);
}

/**
 * 纯函数：决定某个世界实际使用的模型配置。
 * - 创作者署名世界且自带真实 key（非 builtin/generated 且 apiKey 非空）→ 用世界自己的配置（创作者买单）。
 * - 否则若用户配置存在 → 用用户的 key/model（驱动默认世界与生成世界）。
 * - 否则 → 回退到世界自身的 modelConfig（dev 环境下 apiKey 可为 ""，由服务端 env 兜底）。
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
