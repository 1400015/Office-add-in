import type {
  ChatMessage,
  ChatOptions,
  ProviderId,
  ProviderConfig,
} from "../types";
import { BaseProvider, type NormalizedMessage } from "./BaseProvider";
import { clampMaxTokens, modelParams } from "../config/modelParams";
import { ProviderError } from "../types";
import { logger } from "../services/LoggerService";
import { httpStream, parseStreamPayload } from "../services/HttpService";
import { getReasoningStrategy } from "../config/reasoningProfiles";

interface ClaudeResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: { message?: string };
}

export class ClaudeProvider extends BaseProvider {
  readonly id: ProviderId = "claude";

  constructor(config: ProviderConfig) {
    super(config);
  }

  protected override chatPath(): string {
    return "/messages";
  }

  protected normalizeMessages(
    messages: ChatMessage[],
    options: ChatOptions
  ): NormalizedMessage[] {
    let system = options.systemPrompt ?? "";
    const conversation: NormalizedMessage[] = [];
    for (const m of messages) {
      if (m.role === "system") {
        system = system ? `${system}\n\n${m.content}` : m.content;
      } else {
        conversation.push({ role: m.role, content: m.content });
      }
    }
    const strategySuffix = this.reasoningSuffix(options);
    if (strategySuffix) {
      system = system ? `${system}\n\n${strategySuffix}` : strategySuffix;
    }
    const normalized: NormalizedMessage[] = conversation;
    if (system) {
      normalized.unshift({ role: "system", content: system });
    }
    return normalized;
  }

  private reasoningSuffix(options: ChatOptions): string {
    return getReasoningStrategy(options.reasoning).systemPromptSuffix;
  }

  protected buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.requireApiKey(),
      "anthropic-version": "2023-06-01",
    };
  }

  protected buildChatBody(
    messages: NormalizedMessage[],
    options: ChatOptions
  ): Record<string, unknown> {
    const system = messages.find((m) => m.role === "system")?.content;
    const conversation = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));
    const params = modelParams(options.model, this.id);
    return {
      model: options.model,
      max_tokens: clampMaxTokens(options.maxTokens, params.maxTokensLimit),
      ...(params.supportsTemperature
        ? { temperature: options.temperature }
        : {}),
      ...(system ? { system } : {}),
      messages: conversation,
    };
  }

  protected extractChatResponse(data: unknown): string {
    this.assertOk(data);
    const response = data as ClaudeResponse;
    const text = response.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    if (!text) {
      throw new Error("Claude returned an empty response");
    }
    return text;
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
    logger.info("provider", "claude: streaming chat request", {
      model: options.model,
    });

    let emitted = false;
    await httpStream({
      url: this.buildUrl(this.chatPath()),
      headers: this.requestHeaders(),
      body,
      timeout: this.config.timeout,
      provider: this.id,
      format: "sse",
      signal,
      onPayload: (payload) => {
        const parsed = parseStreamPayload<{
          type?: string;
          delta?: { type?: string; text?: string };
        }>(payload, this.id);
        if (
          parsed.type === "content_block_delta" &&
          parsed.delta?.type === "text_delta" &&
          parsed.delta.text
        ) {
          emitted = true;
          onToken(parsed.delta.text);
        }
        if (parsed.type === "message_stop") return "stop";
        return undefined;
      },
    });
    if (!emitted)
      throw new ProviderError(
        this.id,
        "EMPTY_RESPONSE",
        "Claude returned an empty response"
      );
  }
}
