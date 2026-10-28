import { describe, expect, it } from "vitest";
import { clampMaxTokens, modelParams } from "../src/config/modelParams";

describe("modelParams", () => {
  it("drops temperature and uses max_completion_tokens for OpenAI reasoning models", () => {
    for (const model of ["o3-mini", "o4-mini", "gpt-5.5", "gpt-6.1-sol"]) {
      const params = modelParams(model, "openai");
      expect(params.supportsTemperature).toBe(false);
      expect(params.maxTokensField).toBe("max_completion_tokens");
      expect(params.maxTokensLimit).toBe(128000);
    }
  });

  it("keeps temperature for legacy OpenAI chat models", () => {
    const params = modelParams("gpt-4o", "openai");
    expect(params.supportsTemperature).toBe(true);
    expect(params.maxTokensField).toBe("max_completion_tokens");
    expect(params.maxTokensLimit).toBe(32768);
  });

  it("omits temperature for the Claude 5.5 family only", () => {
    expect(modelParams("claude-opus-5-5", "claude").supportsTemperature).toBe(
      false
    );
    expect(modelParams("claude-sonnet-5-5", "claude").supportsTemperature).toBe(
      false
    );
    expect(modelParams("claude-haiku-5-5", "claude").supportsTemperature).toBe(
      false
    );
    expect(
      modelParams("claude-sonnet-4-20250514", "claude").supportsTemperature
    ).toBe(true);
  });

  it("uses maxOutputTokens and family caps for Gemini", () => {
    const modern = modelParams("gemini-3.8-flash", "gemini");
    expect(modern.maxTokensField).toBe("maxOutputTokens");
    expect(modern.maxTokensLimit).toBe(65536);
    expect(modelParams("gemini-2.0-flash", "gemini").maxTokensLimit).toBe(8192);
  });

  it("does not clamp providers without a documented output limit", () => {
    for (const provider of ["mistral", "openrouter", "ollama"] as const) {
      const params = modelParams("some-model", provider);
      expect(clampMaxTokens(999999, params.maxTokensLimit)).toBe(999999);
      expect(params.supportsTemperature).toBe(true);
    }
  });
});
