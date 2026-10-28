import type { ProviderConfig, ProviderId } from "../types";

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  defaultEndpoint: string;
  defaultTimeout: number;
  defaultModels: string[];
  apiKeyLabel: string;
  supportsModelListing: boolean;
  supportsStreaming: boolean;
  corsSafe: boolean;
  docsUrl: string;
}

export const PROVIDER_DEFINITIONS: Record<ProviderId, ProviderDefinition> = {
  mistral: {
    id: "mistral",
    name: "Mistral AI",
    defaultEndpoint: "https://api.mistral.ai/v1",
    defaultTimeout: 120000,
    defaultModels: [
      "mistral-small-latest",
      "mistral-medium-latest",
      "mistral-large-latest",
      "codestral-latest",
      "pixtral-large-latest",
    ],
    apiKeyLabel: "Mistral API Key",
    supportsModelListing: true,
    supportsStreaming: true,
    corsSafe: true,
    docsUrl: "https://docs.mistral.ai/",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    defaultEndpoint: "https://api.openai.com/v1",
    defaultTimeout: 120000,
    defaultModels: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o3-mini"],
    apiKeyLabel: "OpenAI API Key",
    supportsModelListing: true,
    supportsStreaming: true,
    corsSafe: false,
    docsUrl: "https://platform.openai.com/docs/api-reference",
  },
  claude: {
    id: "claude",
    name: "Anthropic Claude",
    defaultEndpoint: "https://api.anthropic.com/v1",
    defaultTimeout: 120000,
    defaultModels: [
      "claude-sonnet-4-20250514",
      "claude-opus-4-20250514",
      "claude-haiku-4-20250514",
    ],
    apiKeyLabel: "Anthropic API Key",
    supportsModelListing: false,
    supportsStreaming: true,
    corsSafe: false,
    docsUrl: "https://docs.anthropic.com/",
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta",
    defaultTimeout: 120000,
    defaultModels: [
      "gemini-2.0-flash",
      "gemini-2.0-pro",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
    ],
    apiKeyLabel: "Google AI API Key",
    supportsModelListing: true,
    supportsStreaming: true,
    corsSafe: true,
    docsUrl: "https://ai.google.dev/",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    defaultEndpoint: "https://openrouter.ai/api/v1",
    defaultTimeout: 180000,
    defaultModels: [
      "openai/gpt-4o",
      "anthropic/claude-sonnet-4",
      "google/gemini-2.0-flash-001",
      "mistralai/mistral-large",
    ],
    apiKeyLabel: "OpenRouter API Key",
    supportsModelListing: true,
    supportsStreaming: true,
    corsSafe: true,
    docsUrl: "https://openrouter.ai/docs",
  },
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    defaultEndpoint: "http://localhost:11434",
    defaultTimeout: 300000,
    defaultModels: ["llama3.2", "mistral", "qwen2.5"],
    apiKeyLabel: "API Key (optional)",
    supportsModelListing: true,
    supportsStreaming: true,
    corsSafe: true,
    docsUrl: "https://ollama.com/",
  },
};

export function createDefaultProviderConfig(id: ProviderId): ProviderConfig {
  const def = PROVIDER_DEFINITIONS[id];
  return {
    id: def.id,
    name: def.name,
    apiKey: "",
    endpoint: def.defaultEndpoint,
    timeout: def.defaultTimeout,
    useProxy: false,
    proxyUrl: import.meta.env.VITE_DEFAULT_PROXY_URL ?? "",
  };
}

export const PROVIDER_ORDER: ProviderId[] = [
  "mistral",
  "openai",
  "claude",
  "gemini",
  "openrouter",
  "ollama",
];
