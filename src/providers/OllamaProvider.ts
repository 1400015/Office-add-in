import type {
  ChatMessage,
  ChatOptions,
  ProviderId,
  ProviderConfig,
} from "../types";
import { BaseProvider, type NormalizedMessage } from "./BaseProvider";
import { clampMaxTokens, modelParams } from "../config/modelParams";
import { httpStream, parseStreamPayload } from "../services/HttpService";
import { ProviderError } from "../types";

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
    const params = modelParams(options.model, this.id);
    return {
      model: options.model,
      messages,
      options: {
        num_predict: clampMaxTokens(options.maxTokens, params.maxTokensLimit),
        ...(params.supportsTemperature
          ? { temperature: options.temperature }
          : {}),
      },
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

  override async chatStream(
    messages: ChatMessage[],
    options: ChatOptions,
    onToken: (chunk: string) => void,
    context?: import("../types").ChatContext,
    signal?: AbortSignal
  ): Promise<void> {
    const normalized = this.normalizeMessages(messages, options);
    const withContext = context?.selectionText
      ? this.attachContext(normalized, context)
      : normalized;
    const body = { ...this.buildChatBody(withContext, options), stream: true };
    let emitted = false;
    await httpStream({
      url: this.buildUrl(this.chatPath()),
      headers: this.requestHeaders(),
      body,
      timeout: this.config.timeout,
      provider: this.id,
      format: "ndjson",
      signal,
      onPayload: (payload) => {
        const frame = parseStreamPayload<{
          message?: { content?: string };
          done?: boolean;
        }>(payload, this.id);
        if (frame.message?.content) {
          emitted = true;
          onToken(frame.message.content);
        }
        if (frame.done) return "stop";
        return undefined;
      },
    });
    if (!emitted)
      throw new ProviderError(
        this.id,
        "EMPTY_RESPONSE",
        "Ollama returned an empty response"
      );
  }

  protected override chatPath(): string {
    return "/api/chat";
  }
}
