import type {
  ChatMessage,
  ChatOptions,
  ProviderId,
  ProviderConfig,
} from "../types";
import { BaseProvider, type NormalizedMessage } from "./BaseProvider";
import { httpRequest } from "../services/HttpService";
import { logger } from "../services/LoggerService";

interface OllamaResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export class OllamaProvider extends BaseProvider {
  readonly id: ProviderId = "ollama";

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
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKey.trim()) {
      headers.Authorization = `Bearer ${this.config.apiKey.trim()}`;
    }
    return headers;
  }

  protected buildChatBody(
    messages: NormalizedMessage[],
    options: ChatOptions
  ): Record<string, unknown> {
    return {
      model: options.model,
      messages,
      temperature: options.temperature,
      options: { num_predict: options.maxTokens },
      stream: false,
    };
  }

  protected extractChatResponse(data: unknown): string {
    this.assertOk(data);
    const response = data as OllamaResponse;
    const content =
      response.choices?.[0]?.message?.content ??
      (data as { message?: { content?: string } }).message?.content;
    if (!content) {
      throw new Error("Ollama returned an empty response");
    }
    return content;
  }

  protected extractTokenFromEvent(data: unknown): string | null {
    const parsed = data as {
      choices?: Array<{ delta?: { content?: string } }>;
      message?: { content?: string };
    };
    return (
      parsed.choices?.[0]?.delta?.content ?? parsed.message?.content ?? null
    );
  }

  override async getModels() {
    try {
      const data = await httpRequest<{ models?: Array<{ name: string }> }>({
        url: this.buildUrl("/api/tags"),
        method: "GET",
        headers: this.buildHeaders(),
        timeout: Math.min(this.config.timeout, 15000),
        provider: this.id,
      });
      const models = (data.models ?? []).map((m) => ({
        id: m.name,
        name: m.name,
        provider: this.id,
      }));
      if (models.length > 0) return models;
    } catch (error) {
      logger.warn("provider", "ollama: model listing failed, using defaults", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return super.getModels();
  }

  protected override chatPath(): string {
    return "/api/chat";
  }
}
