import { describe, expect, it } from "vitest";
import { canTestModelConfig } from "../test-model";

describe("canTestModelConfig", () => {
  it("requires a user-supplied key before the settings page can run a model test", () => {
    expect(canTestModelConfig({ provider: "openrouter", apiKey: "", model: "deepseek/deepseek-v4-pro", reasoningEnabled: false })).toBe(false);
    expect(canTestModelConfig({ provider: "openrouter", apiKey: "   ", model: "deepseek/deepseek-v4-pro", reasoningEnabled: false })).toBe(false);
    expect(canTestModelConfig({ provider: "openrouter", apiKey: "sk-user", model: "deepseek/deepseek-v4-pro", reasoningEnabled: false })).toBe(true);
  });
});
