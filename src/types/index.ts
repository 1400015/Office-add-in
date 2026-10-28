export type ProviderId =
  "mistral" | "openai" | "claude" | "gemini" | "openrouter" | "ollama";

export type ReasoningLevel = "off" | "low" | "medium" | "high" | "maximum";

export type ThemeMode = "light" | "dark" | "auto";

export type OfficeHost = "word" | "excel" | "powerpoint" | "unknown";

export type OfficePlatform = "desktop" | "web" | "unknown";

export type AppView = "chat" | "settings" | "history" | "templates";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
}

export interface ChatHistory {
  id: string;
  timestamp: number;
  provider: ProviderId;
  model: string;
  title: string;
  messages: ChatMessage[];
}

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  apiKey: string;
  endpoint: string;
  timeout: number;
  useProxy: boolean;
  proxyUrl: string;
}

export interface ChatOptions {
  model: string;
  temperature: number;
  maxTokens: number;
  reasoning: ReasoningLevel;
  systemPrompt?: string;
}

export interface AIModel {
  id: string;
  name: string;
  provider: ProviderId;
}

export interface ChatContext {
  host: OfficeHost;
  selectionText?: string;
  contextType: "none" | "selection" | "document" | "range" | "slide";
}

export class ProviderError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly provider: ProviderId;

  constructor(
    provider: ProviderId,
    code: string,
    message: string,
    status?: number
  ) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.code = code;
    this.status = status;
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}
