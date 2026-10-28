export const APP_NAME = "AI Assistant";

export const STORAGE_KEYS = {
  providerConfigs: "ouai.providerConfigs",
  activeProvider: "ouai.activeProvider",
  activeModel: "ouai.activeModel",
  temperature: "ouai.temperature",
  maxTokens: "ouai.maxTokens",
  reasoning: "ouai.reasoning",
  systemPrompt: "ouai.systemPrompt",
  theme: "ouai.theme",
  language: "ouai.language",
} as const;

export const IDB_NAME = "ouai-history";
export const IDB_VERSION = 1;
export const IDB_STORE_CHATS = "chats";
export const MAX_HISTORY_ENTRIES = 100;

export const MAX_CONTEXT_CHARS = 60000;
export const RETRY_ATTEMPTS = 3;
export const RETRY_BASE_DELAY_MS = 1000;
