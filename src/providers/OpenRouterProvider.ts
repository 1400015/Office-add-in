import type {
  ChatMessage,
  ChatOptions,
  ProviderId,
  ProviderConfig,
} from "../types";
import { BaseProvider, type NormalizedMessage } from "./BaseProvider";
import { httpRequest } from "../services/HttpService";
import { logger } from "../services/LoggerService";

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export class OpenRouterProvider extends BaseProvider {
  readonly id: ProviderId = "openrouter";

  constructor(config: ProviderConfig) {
    super(config);
  }

  protected normalizeMessages(
    messages: ChatMessage[],
    options: ChatOptions
  ): NormalizedMessage[] {
    const base: NormalizedMessage[] = [];
    if (options.systemPrompt) {
      base.push({ role: "system", content: options.systemPrompt });
    }
    for (const m of messages) {
      base.push({ role: m.role, content: m.content });
    }
    return this.applyReasoning(base, options);
  }

  protected buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.requireApiKey()}`,
      "HTTP-Referer": "https://localhost:3000",
      "X-Title": "Office Universal AI",
    };
  }

  protected buildChatBody(
    messages: NormalizedMessage[],
    options: ChatOptions
  ): Record<string, unknown> {
    return {
      model: options.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    };
  }

  protected extractChatResponse(data: unknown): string {
    this.assertOk(data);
    const response = data as OpenRouterResponse;
    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenRouter returned an empty response");
    }
    return content;
  }

  protected extractTokenFromEvent(data: unknown): string | null {
    const parsed = data as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    return parsed.choices?.[0]?.delta?.content ?? null;
  }

  override async getModels() {
    try {
      const data = await httpRequest<{
        data?: Array<{ id: string; name?: string }>;
      }>({
        url: this.buildUrl("/models"),
        method: "GET",
        headers: this.buildHeaders(),
        timeout: this.config.timeout,
        provider: this.id,
      });
      this.assertOk(data);
      const models = (data.data ?? []).map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        provider: this.id,
      }));
      if (models.length > 0) return models;
    } catch (error) {
      logger.warn(
        "provider",
        "openrouter: model listing failed, using defaults",
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
    return super.getModels();
  }
}
