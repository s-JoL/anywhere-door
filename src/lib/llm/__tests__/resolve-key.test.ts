import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { resolveApiKey } from "../resolve-key";

describe("resolveApiKey", () => {
  const saved = process.env.OPENROUTER_API_KEY;
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "env-key";
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = saved;
  });

  it("production + empty body.apiKey → no env fallback (strictly BYO-key)", () => {
    expect(resolveApiKey({ apiKey: "", provider: "openrouter" }, "production")).toBe("");
    expect(resolveApiKey({ apiKey: "   ", provider: "openrouter" }, "production")).toBe("");
  });

  it("non-production + empty + openrouter → env fallback (dev convenience)", () => {
    expect(resolveApiKey({ apiKey: "", provider: "openrouter" }, "development")).toBe("env-key");
    expect(resolveApiKey({ apiKey: "", provider: "openrouter" }, "test")).toBe("env-key");
    expect(resolveApiKey({ apiKey: "", provider: "openrouter" }, undefined)).toBe("env-key");
  });

  it("explicit body.apiKey always wins (trimmed), regardless of env", () => {
    expect(resolveApiKey({ apiKey: "  mine  ", provider: "openrouter" }, "production")).toBe("mine");
    expect(resolveApiKey({ apiKey: "mine", provider: "deepseek" }, "development")).toBe("mine");
  });

  it("non-openrouter provider never uses the openrouter env fallback", () => {
    expect(resolveApiKey({ apiKey: "", provider: "deepseek" }, "development")).toBe("");
    expect(resolveApiKey({ apiKey: "", provider: "deepseek" }, "production")).toBe("");
  });
});
