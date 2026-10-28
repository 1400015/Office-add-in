import type {
  ChatMessage,
  ChatOptions,
  ProviderId,
  ProviderConfig,
} from "../types";
import { BaseProvider, type NormalizedMessage } from "./BaseProvider";
import { httpRequest, httpStream } from "../services/HttpService";
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
    return { "Content-Type": "application/json" };
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
    return {
      contents: this.geminiContents(messages),
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      },
    };
  }

  protected chatUrl(model: string, stream: boolean): string {
    const base = this.buildUrl("");
    const path = `/models/${encodeURIComponent(model)}:${stream ? "streamGenerateContent" : "generateContent"}`;
    const key = this.requireApiKey();
    return `${base}${path}?key=${encodeURIComponent(key)}`;
  }

  override async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    context?: import("../types").ChatContext
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
      headers: this.buildHeaders(),
      body,
      timeout: this.config.timeout,
      provider: this.id,
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
    await httpStream({
      url: `${this.chatUrl(options.model, true)}&alt=sse`,
      headers: this.buildHeaders(),
      body,
      timeout: this.config.timeout,
      provider: this.id,
      signal,
      onToken: (chunk) => {
        try {
          const parsed = JSON.parse(chunk) as GeminiResponse;
          const text = parsed.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? "")
            .join("");
          if (text) onToken(text);
        } catch {
          // Gemini SSE sends one JSON object per line, not per data: frame
        }
      },
    });
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

  protected extractTokenFromEvent(_data: unknown): string | null {
    return null;
  }

  override async getModels() {
    try {
      const data = await httpRequest<{
        models?: Array<{ name: string; displayName?: string }>;
      }>({
        url: `${this.buildUrl("/models")}?key=${encodeURIComponent(this.requireApiKey())}`,
        method: "GET",
        headers: this.buildHeaders(),
        timeout: this.config.timeout,
        provider: this.id,
      });
      const models = (data.models ?? [])
        .filter((m) => m.name.includes("generateContent"))
        .map((m) => ({
          id: m.name.replace("models/", ""),
          name: m.displayName ?? m.name.replace("models/", ""),
          provider: this.id,
        }));
      if (models.length > 0) return models;
    } catch (error) {
      logger.warn("provider", "gemini: model listing failed, using defaults", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return super.getModels();
  }
}
