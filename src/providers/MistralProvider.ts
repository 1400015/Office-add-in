import type {
  ChatMessage,
  ChatOptions,
  ProviderId,
  ProviderConfig,
} from "../types";
import { BaseProvider, type NormalizedMessage } from "./BaseProvider";
import { clampMaxTokens, modelParams } from "../config/modelParams";
import { assertResponseComplete } from "../services/responseCompletion";
import { ProviderError } from "../types";
import { normalizeMistralText } from "./mistralText";

interface MistralResponse {
  choices?: Array<{
    message?: { content?: unknown };
    finish_reason?: string | null;
  }>;
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
    const params = modelParams(options.model, this.id);
    return {
      model: options.model,
      messages,
      ...(params.supportsTemperature
        ? { temperature: options.temperature }
        : {}),
      [params.maxTokensField]: clampMaxTokens(
        options.maxTokens,
        params.maxTokensLimit
      ),
    };
  }

  protected extractChatResponse(data: unknown): string {
    this.assertOk(data);
    const response = data as MistralResponse;
    const content = normalizeMistralText(
      response.choices?.[0]?.message?.content
    );
    assertResponseComplete(
      this.id,
      content,
      response.choices?.[0]?.finish_reason,
      ["stop"]
    );
    if (!content) {
      throw new ProviderError(
        this.id,
        "EMPTY_RESPONSE",
        "Mistral returned an empty response"
      );
    }
    return content;
  }

  protected extractStreamText(content: unknown): string {
    return normalizeMistralText(content);
  }
}
