import { describe, expect, it } from "vitest";
import {
  PROVIDER_DEFINITIONS,
  PROVIDER_ORDER,
  createDefaultProviderConfig,
} from "../src/config/providers";

describe("provider definitions", () => {
  it("covers all six providers from the PRD", () => {
    expect(PROVIDER_ORDER).toEqual([
      "mistral",
      "openai",
      "claude",
      "gemini",
      "openrouter",
      "ollama",
    ]);
  });

  it("every provider has a definition", () => {
    for (const id of PROVIDER_ORDER) {
      expect(PROVIDER_DEFINITIONS[id]).toBeDefined();
      expect(PROVIDER_DEFINITIONS[id].defaultModels.length).toBeGreaterThan(0);
    }
  });

  it("flags OpenAI and Claude as not CORS-safe", () => {
    expect(PROVIDER_DEFINITIONS.openai.corsSafe).toBe(false);
    expect(PROVIDER_DEFINITIONS.claude.corsSafe).toBe(false);
  });

  it("creates default configs with empty keys and PRD defaults", () => {
    const mistral = createDefaultProviderConfig("mistral");
    expect(mistral.apiKey).toBe("");
    expect(mistral.endpoint).toBe("https://api.mistral.ai/v1");
    expect(mistral.useProxy).toBe(false);

    const ollama = createDefaultProviderConfig("ollama");
    expect(ollama.endpoint).toBe("http://localhost:11434");
  });
});
