import type { ModelConfig } from "../types";
import { streamChat } from "./stream";

export function canTestModelConfig(cfg: ModelConfig): boolean {
  return cfg.apiKey.trim().length > 0;
}

/** Connectivity test: send a minimal request; if any content streams back, consider it usable. */
export async function testModel(cfg: ModelConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const { content } = await streamChat({ cfg, messages: [{ role: "user", content: "ping，请只回一个字。" }] });
    return content.trim().length > 0 ? { ok: true } : { ok: false, error: "无内容返回" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
