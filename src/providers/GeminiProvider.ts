import type {
  ChatMessage,
  ChatOptions,
  ProviderId,
  ProviderConfig,
} from "../types";
import { BaseProvider, type NormalizedMessage } from "./BaseProvider";
import { clampMaxTokens, modelParams } from "../config/modelParams";
import {
  httpRequest,
  httpStream,
  parseStreamPayload,
} from "../services/HttpService";
import { ProviderError } from "../types";
import { logger } from "../services/LoggerService";

interface GeminiPart {
  text?: string;
}
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  error?: { message?: string };
}

export class GeminiProvider extends BaseProvider {
  readonly id: ProviderId = "gemini";

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
      base.push({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      });
    }
    return this.applyReasoning(base, options);
  }

  protected buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-goog-api-key": this.requireApiKey(),
    };
  }

  protected geminiContents(messages: NormalizedMessage[]): GeminiContent[] {
    const system = messages.find((m) => m.role === "system")?.content;
    const conversation = messages.filter((m) => m.role !== "system");
    const contents: GeminiContent[] = conversation.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    if (system && contents.length > 0) {
      contents[0]!.parts[0]!.text = `${system}\n\n${contents[0]!.parts[0]!.text}`;
    }
    return contents;
  }

  protected buildChatBody(
    messages: NormalizedMessage[],
    options: ChatOptions
  ): Record<string, unknown> {
    const params = modelParams(options.model, this.id);
    return {
      contents: this.geminiContents(messages),
      generationConfig: {
        ...(params.supportsTemperature
          ? { temperature: options.temperature }
          : {}),
        maxOutputTokens: clampMaxTokens(
          options.maxTokens,
          params.maxTokensLimit
        ),
      },
    };
  }

  protected chatUrl(model: string, stream: boolean): string {
    const base = this.buildUrl("");
    const path = `/models/${encodeURIComponent(model)}:${stream ? "streamGenerateContent" : "generateContent"}`;
    return `${base}${path}`;
  }

  override async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    context?: import("../types").ChatContext,
    signal?: AbortSignal
  ): Promise<string> {
    const normalized = this.normalizeMessages(messages, options);
    const withContext = context?.selectionText
      ? this.attachContext(normalized, context)
      : normalized;
    const body = this.buildChatBody(withContext, options);
    logger.info("provider", "gemini: chat request", { model: options.model });
    const data = await httpRequest<GeminiResponse>({
      url: this.chatUrl(options.model, false),
      method: "POST",
      headers: this.requestHeaders(),
      body,
      timeout: this.config.timeout,
      provider: this.id,
      signal,
    });
    return this.extractChatResponse(data);
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
    const body = this.buildChatBody(withContext, options);
    logger.info("provider", "gemini: streaming chat request", {
      model: options.model,
    });
    let emitted = false;
    await httpStream({
      url: `${this.chatUrl(options.model, true)}?alt=sse`,
      headers: this.requestHeaders(),
      body,
      timeout: this.config.timeout,
      provider: this.id,
      signal,
      format: "sse",
      onPayload: (chunk) => {
        const parsed = parseStreamPayload<GeminiResponse>(chunk, this.id);
        const text = parsed.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("");
        if (text) {
          emitted = true;
          onToken(text);
        }
      },
    });
    if (!emitted)
      throw new ProviderError(
        this.id,
        "EMPTY_RESPONSE",
        "Gemini returned an empty response"
      );
  }

  protected extractChatResponse(data: unknown): string {
    this.assertOk(data);
    const response = data as GeminiResponse;
    const text = response.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("");
    if (!text) {
      throw new Error("Gemini returned an empty response");
    }
    return text;
  }
}
