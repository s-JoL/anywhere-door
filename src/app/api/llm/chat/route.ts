import { NextRequest } from "next/server";
import { buildUpstreamRequest, isValidProvider } from "@/lib/llm/providers";
import { resolveApiKey } from "@/lib/llm/resolve-key";
import type { ChatMessage, ModelConfig } from "@/lib/types";

export const runtime = "nodejs";
const TIMEOUT_MS = 90_000;

export async function POST(req: NextRequest) {
  let body: ModelConfig & { messages: ChatMessage[] };
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  if (!isValidProvider(body.provider)) return json({ error: "unknown provider" }, 400);

  // Production is strictly BYO-key; the env fallback is a dev-only convenience.
  const apiKey = resolveApiKey(body, process.env.NODE_ENV);
  if (!apiKey) return json({ error: "missing api key" }, 400);

  const up = buildUpstreamRequest({ ...body, apiKey }, body.messages);
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(TIMEOUT_MS)]);
  let resp: Response;
  try {
    resp = await fetch(up.url, { method: "POST", headers: up.headers, body: up.body, signal });
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError" || (e as Error)?.name === "TimeoutError";
    return json({ error: aborted ? "upstream timeout/aborted" : "upstream fetch failed" }, aborted ? 504 : 502);
  }
  if (!resp.ok || !resp.body) {
    console.error(`[llm-proxy] ${body.provider} ${resp.status}: ${await resp.text().catch(() => "")}`);
    return json({ error: `upstream ${resp.status}` }, 502);
  }
  return new Response(resp.body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
