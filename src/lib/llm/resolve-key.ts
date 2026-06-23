import type { ModelConfig } from "../types";

/**
 * Resolve the API key for an LLM proxy request.
 *
 * Security: the `OPENROUTER_API_KEY` env fallback is a DEV-ONLY convenience so
 * local development works without filling the in-app /settings page. In
 * production the host MUST NOT lend its key to anonymous visitors — deployments
 * are strictly bring-your-own-key (BYO-key). A missing key surfaces the existing
 * "missing api key" 400 and the play UI's "去设置" prompt.
 *
 * Resolution order:
 *   1. An explicit `body.apiKey` (trimmed) always wins.
 *   2. Otherwise, for the `openrouter` provider in non-production, fall back to
 *      `process.env.OPENROUTER_API_KEY`.
 *   3. Otherwise, "" (caller returns the missing-key error).
 */
export function resolveApiKey(
  body: Pick<ModelConfig, "apiKey" | "provider">,
  nodeEnv: string | undefined,
): string {
  const devFallback =
    nodeEnv !== "production" ? process.env.OPENROUTER_API_KEY ?? "" : "";
  return body.apiKey?.trim() || (body.provider === "openrouter" ? devFallback : "");
}
