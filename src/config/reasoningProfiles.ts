import type { ProviderId, ReasoningLevel } from "../types";

export const REASONING_LEVELS: ReasoningLevel[] = [
  "off",
  "low",
  "medium",
  "high",
  "maximum",
];

export const REASONING_LABELS: Record<ReasoningLevel, string> = {
  off: "OFF",
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  maximum: "MAXIMUM",
};

interface ReasoningStrategy {
  systemPromptSuffix: string;
  effort?: "minimal" | "low" | "medium" | "high";
  maxCompletionTokens?: number;
}

const PROMPT_SUFFIX: Record<ReasoningLevel, string> = {
  off: "",
  low: "Think briefly before answering. Give a direct, concise response.",
  medium:
    "Reason step by step about the problem before giving the final answer. Be concise in the reasoning.",
  high: "Reason carefully and thoroughly. Analyse alternatives before concluding.",
  maximum:
    "Take as much time as needed. Explore the problem deeply, consider edge cases, verify your reasoning, and only then provide a comprehensive final answer.",
};

function buildStrategy(level: ReasoningLevel): ReasoningStrategy {
  return {
    systemPromptSuffix: PROMPT_SUFFIX[level],
    effort:
      level === "off"
        ? undefined
        : level === "low"
          ? "low"
          : level === "medium"
            ? "medium"
            : "high",
  };
}

const STRATEGY_CACHE = new Map<ReasoningLevel, ReasoningStrategy>();

export function getReasoningStrategy(level: ReasoningLevel): ReasoningStrategy {
  let strategy = STRATEGY_CACHE.get(level);
  if (!strategy) {
    strategy = buildStrategy(level);
    STRATEGY_CACHE.set(level, strategy);
  }
  return strategy;
}

interface ProviderReasoningSupport {
  nativeEffort: boolean;
  prefixMessages: boolean;
}

const PROVIDER_SUPPORT: Record<ProviderId, ProviderReasoningSupport> = {
  mistral: { nativeEffort: false, prefixMessages: true },
  openai: { nativeEffort: true, prefixMessages: true },
  claude: { nativeEffort: false, prefixMessages: true },
  gemini: { nativeEffort: false, prefixMessages: true },
  openrouter: { nativeEffort: false, prefixMessages: true },
  ollama: { nativeEffort: false, prefixMessages: true },
};

export function providerSupportsReasoning(provider: ProviderId): boolean {
  return PROVIDER_SUPPORT[provider].prefixMessages;
}

export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_MAX_TOKENS = 8192;
export const MAX_TOKENS_LIMIT = 128000;
