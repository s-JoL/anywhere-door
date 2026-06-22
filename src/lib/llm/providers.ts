import type { ModelConfig, ChatMessage } from "../types";

const BASES: Record<ModelConfig["provider"], string> = {
  openrouter: "https://openrouter.ai/api/v1",
  deepseek: "https://api.deepseek.com",
};

export function isValidProvider(p: unknown): p is ModelConfig["provider"] {
  return p === "openrouter" || p === "deepseek";
}

export function buildUpstreamRequest(cfg: ModelConfig, messages: ChatMessage[]) {
  const payload: Record<string, unknown> = { model: cfg.model, messages, stream: true };
  if (cfg.provider === "openrouter") payload.reasoning = { enabled: cfg.reasoningEnabled };
  return {
    url: `${BASES[cfg.provider]}/chat/completions`,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` } as Record<string, string>,
    body: JSON.stringify(payload),
  };
}
