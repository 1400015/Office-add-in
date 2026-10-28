import type { ProviderId } from "../types";

export interface ModelParams {
  /** Field name each provider expects for the output token budget. */
  maxTokensField: "max_tokens" | "max_completion_tokens" | "maxOutputTokens";
  /** Upper bound for the output budget; Infinity when the API validates it. */
  maxTokensLimit: number;
  /** False when the model rejects a custom temperature. */
  supportsTemperature: boolean;
}

const NO_LIMIT = Number.POSITIVE_INFINITY;

export function clampMaxTokens(value: number, limit: number): number {
  if (!Number.isFinite(limit)) return value;
  return Math.min(value, limit);
}

/**
 * Request parameters differ per model family: reasoning models reject a custom
 * temperature and expect `max_completion_tokens`, Gemini names the budget
 * `maxOutputTokens`, and the Claude 5.5 family returns a 400 for sampling
 * parameters. Sending one body for every model fails those requests.
 */
export function modelParams(model: string, provider: ProviderId): ModelParams {
  const id = model.toLowerCase();
  switch (provider) {
    case "openai": {
      const reasoning = /^o\d/.test(id) || /^gpt-[56]/.test(id);
      return {
        maxTokensField: "max_completion_tokens",
        maxTokensLimit: reasoning ? 128000 : 32768,
        supportsTemperature: !reasoning,
      };
    }
    case "claude": {
      const strictSampling = /claude-(opus|sonnet|haiku)-5-5/.test(id);
      return {
        maxTokensField: "max_tokens",
        maxTokensLimit: 128000,
        supportsTemperature: !strictSampling,
      };
    }
    case "gemini": {
      const modern = /gemini-(3|4)/.test(id);
      return {
        maxTokensField: "maxOutputTokens",
        maxTokensLimit: modern ? 65536 : 8192,
        supportsTemperature: true,
      };
    }
    case "mistral":
    case "openrouter":
    case "ollama":
    default:
      return {
        maxTokensField: "max_tokens",
        maxTokensLimit: NO_LIMIT,
        supportsTemperature: true,
      };
  }
}
