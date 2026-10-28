import { create } from "zustand";
import type {
  AppView,
  ChatHistory,
  ChatMessage,
  OfficeHost,
  OfficePlatform,
  ProviderConfig,
  ProviderId,
  ReasoningLevel,
  ThemeMode,
} from "../types";
import {
  createDefaultProviderConfig,
  PROVIDER_ORDER,
} from "../config/providers";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
} from "../config/reasoningProfiles";
import { StorageService, StorageLockedError } from "../services/StorageService";
import { HistoryService } from "../services/HistoryService";
import { ModelService } from "../services/ModelService";
import { STORAGE_KEYS } from "../constants";
import { logger } from "../services/LoggerService";
import { CryptoService } from "../services/CryptoService";

interface PendingAction {
  id: string;
  label: string;
  kind: "summarize" | "translate" | "analyse" | "custom";
}

interface AppState {
  host: OfficeHost;
  platform: OfficePlatform;
  officeReady: boolean;

  providerConfigs: Record<ProviderId, ProviderConfig>;
  activeProvider: ProviderId;
  activeModel: string;
  temperature: number;
  maxTokens: number;
  reasoning: ReasoningLevel;
  systemPrompt: string;
  theme: ThemeMode;
  language: string;
  view: AppView;

  currentChatId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;
  pendingAction: PendingAction | null;
  history: ChatHistory[];
  secretsLocked: boolean;
  passphraseEnabled: boolean;

  setOfficeInfo: (host: OfficeHost, platform: OfficePlatform) => void;
  updateProviderConfig: (
    id: ProviderId,
    patch: Partial<ProviderConfig>
  ) => void;
  setActiveProvider: (id: ProviderId) => void;
  setActiveModel: (model: string) => void;
  setTemperature: (value: number) => void;
  setMaxTokens: (value: number) => void;
  setReasoning: (level: ReasoningLevel) => void;
  setSystemPrompt: (prompt: string) => void;
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: string) => void;
  setView: (view: AppView) => void;

  startNewChat: () => void;
  loadChat: (id: string) => void;
  setMessages: (messages: ChatMessage[]) => void;
  appendMessage: (message: ChatMessage) => void;
  setStreaming: (streaming: boolean, content?: string) => void;
  appendStreamToken: (token: string) => void;
  setError: (error: string | null) => void;
  setPendingAction: (action: PendingAction | null) => void;
  setHistory: (history: ChatHistory[]) => void;
  persist: () => Promise<void>;
  hydrate: () => Promise<void>;
  createPassphrase: (passphrase: string) => Promise<void>;
  unlockSecrets: (passphrase: string) => Promise<boolean>;
  lockSecrets: () => void;
}

function createEmptyConfigs(): Record<ProviderId, ProviderConfig> {
  const configs = {} as Record<ProviderId, ProviderConfig>;
  for (const id of PROVIDER_ORDER) {
    configs[id] = createDefaultProviderConfig(id);
  }
  return configs;
}

function newChatId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function initialView(): AppView {
  if (typeof window === "undefined") return "chat";
  return new URLSearchParams(window.location.search).get("view") === "settings"
    ? "settings"
    : "chat";
}

export const useAppStore = create<AppState>((set, get) => ({
  host: "unknown",
  platform: "unknown",
  officeReady: false,

  providerConfigs: createEmptyConfigs(),
  activeProvider: "mistral",
  activeModel: "",
  temperature: DEFAULT_TEMPERATURE,
  maxTokens: DEFAULT_MAX_TOKENS,
  reasoning: "medium",
  systemPrompt: "",
  theme: "auto",
  language: "en",
  view: initialView(),

  currentChatId: null,
  messages: [],
  isStreaming: false,
  streamingContent: "",
  error: null,
  pendingAction: null,
  history: [],
  secretsLocked: false,
  passphraseEnabled: false,

  setOfficeInfo: (host, platform) => set({ host, platform, officeReady: true }),

  updateProviderConfig: (id, patch) => {
    // The cached model list depends on the credentials and endpoint.
    ModelService.invalidate(id);
    set((state) => ({
      providerConfigs: {
        ...state.providerConfigs,
        [id]: { ...state.providerConfigs[id], ...patch },
      },
    }));
  },
  setActiveProvider: (id) => set({ activeProvider: id }),
  setActiveModel: (model) => set({ activeModel: model }),
  setTemperature: (value) => set({ temperature: value }),
  setMaxTokens: (value) => set({ maxTokens: value }),
  setReasoning: (level) => set({ reasoning: level }),
  setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),
  setTheme: (theme) => set({ theme }),
  setLanguage: (language) => set({ language }),
  setView: (view) => set({ view }),

  startNewChat: () =>
    set({
      currentChatId: null,
      messages: [],
      isStreaming: false,
      streamingContent: "",
      error: null,
    }),

  loadChat: (id) => {
    const chat = get().history.find((c) => c.id === id);
    if (chat) {
      set({ currentChatId: chat.id, messages: chat.messages, error: null });
    }
  },

  setMessages: (messages) => set({ messages }),
  appendMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  setStreaming: (streaming, content) =>
    set((state) => ({
      isStreaming: streaming,
      streamingContent: content ?? (streaming ? state.streamingContent : ""),
    })),
  appendStreamToken: (token) =>
    set((state) => ({
      streamingContent: state.streamingContent + token,
    })),

  setError: (error) => set({ error }),
  setPendingAction: (action) => set({ pendingAction: action }),
  setHistory: (history) => set({ history }),

  persist: async () => {
    const state = get();
    const writes: Promise<void>[] = [
      StorageService.setItem(STORAGE_KEYS.activeProvider, state.activeProvider),
      StorageService.setItem(STORAGE_KEYS.temperature, state.temperature),
      StorageService.setItem(STORAGE_KEYS.maxTokens, state.maxTokens),
      StorageService.setItem(STORAGE_KEYS.reasoning, state.reasoning),
      StorageService.setItem(STORAGE_KEYS.systemPrompt, state.systemPrompt),
      StorageService.setItem(STORAGE_KEYS.theme, state.theme),
      StorageService.setItem(STORAGE_KEYS.language, state.language),
    ];
    if (!state.secretsLocked) {
      writes.push(
        StorageService.setItem(
          STORAGE_KEYS.providerConfigs,
          state.providerConfigs
        )
      );
    }
    await Promise.all(writes);
    const activeModelMap =
      (await StorageService.getItem<Record<string, string>>(
        STORAGE_KEYS.activeModel
      )) ?? {};
    activeModelMap[state.activeProvider] = state.activeModel;
    await StorageService.setItem(STORAGE_KEYS.activeModel, activeModelMap);

    if (state.messages.length > 0) {
      const chat: ChatHistory = {
        id: state.currentChatId ?? newChatId(),
        timestamp: Date.now(),
        provider: state.activeProvider,
        model: state.activeModel,
        title: state.messages[0]?.content.slice(0, 60) ?? "New chat",
        messages: state.messages,
      };
      await HistoryService.saveChat(chat);
      set({ currentChatId: chat.id });
    }
  },

  hydrate: async () => {
    let configs: Record<ProviderId, ProviderConfig> | null = null;
    let secretsLocked = false;
    try {
      configs = await StorageService.getItem<
        Record<ProviderId, ProviderConfig>
      >(STORAGE_KEYS.providerConfigs);
    } catch (error) {
      if (error instanceof StorageLockedError) secretsLocked = true;
      else throw error;
    }
    const passphraseEnabled = await CryptoService.hasPassphrase().catch(
      () => false
    );
    const [
      activeProvider,
      temperature,
      maxTokens,
      reasoning,
      systemPrompt,
      theme,
      language,
      modelMap,
      history,
    ] = await Promise.all([
      StorageService.getItem<ProviderId>(STORAGE_KEYS.activeProvider),
      StorageService.getItem<number>(STORAGE_KEYS.temperature),
      StorageService.getItem<number>(STORAGE_KEYS.maxTokens),
      StorageService.getItem<ReasoningLevel>(STORAGE_KEYS.reasoning),
      StorageService.getItem<string>(STORAGE_KEYS.systemPrompt),
      StorageService.getItem<ThemeMode>(STORAGE_KEYS.theme),
      StorageService.getItem<string>(STORAGE_KEYS.language),
      StorageService.getItem<Record<string, string>>(STORAGE_KEYS.activeModel),
      HistoryService.listChats().catch((error) => {
        logger.warn("store", "Failed to load history", {
          error: error instanceof Error ? error.message : String(error),
        });
        return [] as ChatHistory[];
      }),
    ]);

    const mergedConfigs = createEmptyConfigs();
    if (configs) {
      for (const id of PROVIDER_ORDER) {
        if (configs[id]) {
          mergedConfigs[id] = { ...mergedConfigs[id], ...configs[id] };
        }
      }
    }

    const provider = activeProvider ?? "mistral";
    set({
      providerConfigs: mergedConfigs,
      activeProvider: provider,
      activeModel: modelMap?.[provider] ?? "",
      temperature: temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: maxTokens ?? DEFAULT_MAX_TOKENS,
      reasoning: reasoning ?? "medium",
      systemPrompt: systemPrompt ?? "",
      theme: theme ?? "auto",
      language: language ?? "en",
      history,
      secretsLocked,
      passphraseEnabled,
    });
  },

  createPassphrase: async (passphrase) => {
    await CryptoService.createPassphrase(passphrase);
    set({ secretsLocked: false, passphraseEnabled: true });
    await get().persist();
    await HistoryService.resealAll();
    set({ history: await HistoryService.listChats() });
  },

  unlockSecrets: async (passphrase) => {
    const ok = await CryptoService.unlock(passphrase);
    if (!ok) return false;
    set({ secretsLocked: false, passphraseEnabled: true });
    await get().hydrate();
    await HistoryService.resealAll();
    set({ history: await HistoryService.listChats() });
    return true;
  },

  lockSecrets: () => {
    CryptoService.lock();
    set({
      secretsLocked: true,
      passphraseEnabled: true,
      providerConfigs: createEmptyConfigs(),
      history: [],
      messages: [],
      currentChatId: null,
      streamingContent: "",
    });
  },
}));
