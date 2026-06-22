import type { ModelConfig, ChatMessage } from "../types";
import { parseSseChunks, extractDelta } from "./sse";

export interface StreamArgs {
  cfg: ModelConfig;
  messages: ChatMessage[];
  onContent?: (delta: string) => void;
  signal?: AbortSignal;
}

export async function streamChat({ cfg, messages, onContent, signal }: StreamArgs): Promise<{ content: string }> {
  const resp = await fetch("/api/llm/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...cfg, messages }),
    signal,
  });
  if (!resp.ok || !resp.body) {
    const err = await resp.json().catch(() => ({ error: `http ${resp.status}` }));
    throw new Error(err.error ?? `http ${resp.status}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", content = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseChunks(buffer);
    buffer = rest;
    for (const ev of events) {
      const delta = extractDelta(ev);
      if (delta) { content += delta; onContent?.(delta); }
    }
  }
  return { content };
}
