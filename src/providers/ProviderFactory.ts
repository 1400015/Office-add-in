import type { ProviderConfig, ProviderId } from "../types";
import { BaseProvider } from "./BaseProvider";
import { MistralProvider } from "./MistralProvider";
import { OpenAIProvider } from "./OpenAIProvider";
import { ClaudeProvider } from "./ClaudeProvider";
import { GeminiProvider } from "./GeminiProvider";
import { OpenRouterProvider } from "./OpenRouterProvider";
import { OllamaProvider } from "./OllamaProvider";

export function createProvider(config: ProviderConfig): BaseProvider {
  switch (config.id) {
    case "mistral":
      return new MistralProvider(config);
    case "openai":
      return new OpenAIProvider(config);
    case "claude":
      return new ClaudeProvider(config);
    case "gemini":
      return new GeminiProvider(config);
    case "openrouter":
      return new OpenRouterProvider(config);
    case "ollama":
      return new OllamaProvider(config);
    default: {
      const exhaustive: never = config.id;
      throw new Error(`Unknown provider: ${String(exhaustive)}`);
    }
  }
}

export type { BaseProvider };
export type { ProviderId };
