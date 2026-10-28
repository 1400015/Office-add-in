import type { ReasoningLevel } from "../types";

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
  return { systemPromptSuffix: PROMPT_SUFFIX[level] };
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

export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_MAX_TOKENS = 8192;
export const MAX_TOKENS_LIMIT = 128000;
