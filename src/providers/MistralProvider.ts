import type {
  ChatMessage,
  ChatOptions,
  ProviderId,
  ProviderConfig,
} from "../types";
import { BaseProvider, type NormalizedMessage } from "./BaseProvider";
import { httpRequest } from "../services/HttpService";

interface MistralResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export class MistralProvider extends BaseProvider {
  readonly id: ProviderId = "mistral";

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
    const response = data as MistralResponse;
    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Mistral returned an empty response");
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
    const data = await this.fetchModels();
    return data;
  }

  private async fetchModels() {
    try {
      const data = await httpRequest<{ data?: Array<{ id: string }> }>({
        url: this.buildUrl("/models"),
        method: "GET",
        headers: this.buildHeaders(),
        timeout: this.config.timeout,
        provider: this.id,
      });
      this.assertOk(data);
      const models = data.data ?? [];
      if (models.length > 0) {
        return models.map((m) => ({ id: m.id, name: m.id, provider: this.id }));
      }
    } catch {
      // fall back to defaults
    }
    return super.getModels();
  }
}
