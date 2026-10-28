import type {
  AIModel,
  ChatContext,
  ChatMessage,
  ChatOptions,
  ProviderConfig,
  ProviderId,
} from "../types";
import { ConfigurationError, ProviderError } from "../types";
import { httpRequest, httpStream } from "../services/HttpService";
import { logger } from "../services/LoggerService";
import { getReasoningStrategy } from "../config/reasoningProfiles";
import { PROVIDER_DEFINITIONS } from "../config/providers";

export interface NormalizedMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export abstract class BaseProvider {
  abstract readonly id: ProviderId;

  constructor(protected readonly config: ProviderConfig) {}

  protected get definition() {
    return PROVIDER_DEFINITIONS[this.id];
  }

  protected requireApiKey(): string {
    if (!this.config.apiKey.trim()) {
      throw new ConfigurationError(
        `API key for ${this.definition.name} is not configured. Open Settings to add it.`
      );
    }
    return this.config.apiKey.trim();
  }

  protected buildUrl(path: string): string {
    const base =
      this.config.useProxy && this.config.proxyUrl
        ? this.config.proxyUrl.replace(/\/$/, "")
        : this.config.endpoint.replace(/\/$/, "");
    return `${base}${path}`;
  }

  protected applyReasoning(
    messages: NormalizedMessage[],
    options: ChatOptions
  ): NormalizedMessage[] {
    const strategy = getReasoningStrategy(options.reasoning);
    if (!strategy.systemPromptSuffix) return messages;

    const systemIndex = messages.findIndex((m) => m.role === "system");
    if (systemIndex >= 0) {
      const copy = [...messages];
      const existing = copy[systemIndex]!;
      copy[systemIndex] = {
        ...existing,
        content: `${existing.content}\n\n${strategy.systemPromptSuffix}`,
      };
      return copy;
    }
    return [
      { role: "system", content: strategy.systemPromptSuffix },
      ...messages,
    ];
  }

  protected abstract normalizeMessages(
    messages: ChatMessage[],
    options: ChatOptions
  ): NormalizedMessage[];

  protected abstract buildHeaders(): Record<string, string>;

  protected abstract buildChatBody(
    messages: NormalizedMessage[],
    options: ChatOptions
  ): Record<string, unknown>;

  protected abstract extractChatResponse(data: unknown): string;

  protected abstract extractTokenFromEvent(data: unknown): string | null;

  async getModels(): Promise<AIModel[]> {
    return this.definition.defaultModels.map((id) => ({
      id,
      name: id,
      provider: this.id,
    }));
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    context?: ChatContext
  ): Promise<string> {
    const normalized = this.normalizeMessages(messages, options);
    const withContext = context?.selectionText
      ? this.attachContext(normalized, context)
      : normalized;
    const body = this.buildChatBody(withContext, options);
    logger.info("provider", `${this.id}: chat request`, {
      model: options.model,
      reasoning: options.reasoning,
      messageCount: withContext.length,
    });

    const data = await httpRequest<unknown>({
      url: this.buildUrl(this.chatPath()),
      method: "POST",
      headers: this.buildHeaders(),
      body,
      timeout: this.config.timeout,
      provider: this.id,
    });
    return this.extractChatResponse(data);
  }

  async chatStream(
    messages: ChatMessage[],
    options: ChatOptions,
    onToken: (chunk: string) => void,
    context?: ChatContext,
    signal?: AbortSignal
  ): Promise<void> {
    const normalized = this.normalizeMessages(messages, options);
    const withContext = context?.selectionText
      ? this.attachContext(normalized, context)
      : normalized;
    const body = { ...this.buildChatBody(withContext, options), stream: true };
    logger.info("provider", `${this.id}: streaming chat request`, {
      model: options.model,
      reasoning: options.reasoning,
    });

    await httpStream({
      url: this.buildUrl(this.chatPath()),
      headers: this.buildHeaders(),
      body,
      timeout: this.config.timeout,
      provider: this.id,
      signal,
      onToken: (raw) => {
        onToken(raw);
      },
    });
  }

  protected chatPath(): string {
    return "/chat/completions";
  }

  protected attachContext(
    messages: NormalizedMessage[],
    context: ChatContext
  ): NormalizedMessage[] {
    const label =
      context.contextType === "selection"
        ? "Selected text"
        : context.contextType === "range"
          ? "Selected range"
          : context.contextType === "slide"
            ? "Current slide"
            : "Document";
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") return messages;
    const copy = [...messages];
    copy[copy.length - 1] = {
      ...last,
      content: `[${label} from ${context.host}]\n"""\n${context.selectionText}\n"""\n\n${last.content}`,
    };
    return copy;
  }

  async summarize(text: string, options: ChatOptions): Promise<string> {
    return this.chat(
      [
        {
          id: "sum",
          role: "user",
          content: `Summarize the following content concisely, preserving the key points:\n\n${text}`,
          timestamp: Date.now(),
        },
      ],
      options
    );
  }

  async translate(
    text: string,
    targetLanguage: string,
    options: ChatOptions
  ): Promise<string> {
    return this.chat(
      [
        {
          id: "tr",
          role: "user",
          content: `Translate the following text into ${targetLanguage}. Return only the translation, without explanations:\n\n${text}`,
          timestamp: Date.now(),
        },
      ],
      options
    );
  }

  async analyse(text: string, options: ChatOptions): Promise<string> {
    return this.chat(
      [
        {
          id: "an",
          role: "user",
          content: `Analyse the following content. Identify key insights, trends, anomalies and provide an executive summary:\n\n${text}`,
          timestamp: Date.now(),
        },
      ],
      options
    );
  }

  protected assertOk(data: unknown): void {
    if (
      data !== null &&
      typeof data === "object" &&
      "error" in data &&
      (data as { error?: unknown }).error
    ) {
      const err = (data as { error: { message?: string } }).error;
      throw new ProviderError(
        this.id,
        "API_ERROR",
        err.message ?? "Provider returned an error"
      );
    }
  }
}
