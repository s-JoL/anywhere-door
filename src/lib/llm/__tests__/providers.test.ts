import { describe, it, expect } from "vitest";
import { buildUpstreamRequest } from "../providers";

describe("buildUpstreamRequest", () => {
  it("openrouter: bearer auth + chat completions url + stream", () => {
    const r = buildUpstreamRequest(
      { provider: "openrouter", apiKey: "k", model: "x/y", reasoningEnabled: false },
      [{ role: "user", content: "hi" }],
    );
    expect(r.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(r.headers.Authorization).toBe("Bearer k");
    expect(JSON.parse(r.body).stream).toBe(true);
    expect(JSON.parse(r.body).model).toBe("x/y");
  });
  it("deepseek: own base url", () => {
    const r = buildUpstreamRequest(
      { provider: "deepseek", apiKey: "k", model: "deepseek-v4-flash", reasoningEnabled: false },
      [{ role: "user", content: "hi" }],
    );
    expect(r.url).toBe("https://api.deepseek.com/chat/completions");
  });
});
