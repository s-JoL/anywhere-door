import type { ModelConfig } from "../types";
import { streamChat } from "./stream";

/** 连通测试：发一句最小请求，能流式拿到任意内容即视为可用。 */
export async function testModel(cfg: ModelConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const { content } = await streamChat({ cfg, messages: [{ role: "user", content: "ping，请只回一个字。" }] });
    return content.trim().length > 0 ? { ok: true } : { ok: false, error: "无内容返回" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
