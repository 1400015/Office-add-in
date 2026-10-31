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
import { detectLanguage } from "../i18n";
import { OperationService } from "../services/OperationService";

interface PendingAction {
  id: string;
  label: string;
  kind: "summarize" | "translate" | "analyse" | "custom";
}

interface AppState {
  host: OfficeHost;
  platform: OfficePlatform;
  officeReady: boolean;
  hydrated: boolean;
  vaultBusy: boolean;

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
  ensureChatId: () => string;
  saveConversation: (
    messages: ChatMessage[],
    provider: ProviderId,
    model: string,
    id: string
  ) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
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

let historyQueue: Promise<void> = Promise.resolve();
let settingsQueue: Promise<void> = Promise.resolve();
let historyEpoch = 0;
let historyVersion = 0;
const chatRevisions = new Map<string, number>();
const pendingDeletions = new Map<string, number>();
let clearingHistory = false;
let vaultEpoch = 0;
let hydrationSerial = 0;
function queueHistory(work: () => Promise<void>): Promise<void> {
  const result = historyQueue.then(work);
  historyQueue = result.catch(() => {});
  return result;
}

function queueSettings(work: () => Promise<void>): Promise<void> {
  const result = settingsQueue.then(work);
  settingsQueue = result.catch(() => {});
  return result;
}

export const useAppStore = create<AppState>((set, get) => ({
  host: "unknown",
  platform: "unknown",
  officeReady: false,
  hydrated: false,
  vaultBusy: false,

  providerConfigs: createEmptyConfigs(),
  activeProvider: "mistral",
  activeModel: "",
  temperature: DEFAULT_TEMPERATURE,
  maxTokens: DEFAULT_MAX_TOKENS,
  reasoning: "medium",
  systemPrompt: "",
  theme: "auto",
  language: detectLanguage(),
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

  startNewChat: () => {
    OperationService.cancel();
    set({
      currentChatId: null,
      messages: [],
      isStreaming: false,
      pendingAction: null,
      streamingContent: "",
      error: null,
    });
  },

  loadChat: (id) => {
    if (clearingHistory || pendingDeletions.has(id) || get().secretsLocked)
      return;
    const chat = get().history.find((c) => c.id === id);
    if (chat) {
      OperationService.cancel();
      set({
        currentChatId: chat.id,
        messages: chat.messages,
        error: null,
        isStreaming: false,
        pendingAction: null,
        streamingContent: "",
      });
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

  persist: () =>
    queueSettings(async () => {
      const state = get();
      const writes: Promise<void>[] = [
        StorageService.setItem(
          STORAGE_KEYS.activeProvider,
          state.activeProvider
        ),
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
      await ModelService.setStoredActiveModel(
        state.activeProvider,
        state.activeModel
      );
    }),

  ensureChatId: () => {
    const existing = get().currentChatId;
    if (existing) return existing;
    const id = newChatId();
    set({ currentChatId: id });
    return id;
  },

  saveConversation: async (messages, provider, model, id) => {
    if (!messages.length) return;
    const epoch = historyEpoch;
    const version = ++historyVersion;
    const revision = chatRevisions.get(id) ?? 0;
    const chat: ChatHistory = {
      id,
      timestamp: Date.now(),
      provider,
      model,
      title: messages[0]?.content.slice(0, 60) ?? "New chat",
      messages: [...messages],
    };
    await queueHistory(async () => {
      if (historyEpoch !== epoch || (chatRevisions.get(id) ?? 0) !== revision)
        return;
      await HistoryService.saveChat(chat);
    });
    if (
      historyEpoch === epoch &&
      (chatRevisions.get(id) ?? 0) === revision &&
      !get().secretsLocked
    ) {
      const history = await HistoryService.listChats();
      if (
        historyEpoch === epoch &&
        historyVersion === version &&
        !get().secretsLocked
      )
        set({ history });
    }
  },

  deleteConversation: async (id) => {
    const version = ++historyVersion;
    const revision = (chatRevisions.get(id) ?? 0) + 1;
    chatRevisions.set(id, revision);
    pendingDeletions.set(id, revision);
    set((state) => ({
      history: state.history.filter((chat) => chat.id !== id),
    }));
    if (get().currentChatId === id) get().startNewChat();
    try {
      await queueHistory(() => HistoryService.deleteChat(id));
      const history = await HistoryService.listChats();
      if (historyVersion === version && !get().secretsLocked) set({ history });
    } finally {
      if (pendingDeletions.get(id) === revision) pendingDeletions.delete(id);
    }
  },

  clearHistory: async () => {
    const epoch = ++historyEpoch;
    clearingHistory = true;
    const version = ++historyVersion;
    get().startNewChat();
    set({ history: [] });
    try {
      await queueHistory(() => HistoryService.clear());
      if (historyVersion === version) set({ history: [] });
    } finally {
      if (historyEpoch === epoch) clearingHistory = false;
    }
  },

  hydrate: async () => {
    const serial = ++hydrationSerial;
    const epoch = vaultEpoch;
    const revision = CryptoService.getRevision();
    const initialHistoryVersion = historyVersion;
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
    const passphraseEnabled =
      typeof OfficeRuntime === "undefined"
        ? false
        : await CryptoService.hasPassphrase();
    secretsLocked =
      secretsLocked || (passphraseEnabled && !CryptoService.isUnlocked());
    if (secretsLocked) configs = null;
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
    if (
      serial !== hydrationSerial ||
      epoch !== vaultEpoch ||
      revision !== CryptoService.getRevision()
    )
      return;
    set({
      providerConfigs: mergedConfigs,
      activeProvider: provider,
      activeModel: modelMap?.[provider] ?? "",
      temperature: temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: maxTokens ?? DEFAULT_MAX_TOKENS,
      reasoning: reasoning ?? "medium",
      systemPrompt: systemPrompt ?? "",
      theme: theme ?? "auto",
      language: language ?? detectLanguage(),
      history:
        initialHistoryVersion === historyVersion && !clearingHistory
          ? history.filter((chat) => !pendingDeletions.has(chat.id))
          : get().history,
      secretsLocked,
      passphraseEnabled,
      hydrated: !get().vaultBusy,
    });
  },

  createPassphrase: async (passphrase) => {
    if (get().vaultBusy) throw new Error("locked");
    const epoch = ++vaultEpoch;
    OperationService.cancel();
    set({
      hydrated: false,
      vaultBusy: true,
      isStreaming: false,
      pendingAction: null,
      streamingContent: "",
    });
    try {
      await queueHistory(async () => {
        if (epoch !== vaultEpoch) throw new StorageLockedError();
        await CryptoService.createPassphrase(passphrase);
        const revision = CryptoService.getRevision();
        const assertCurrent = (): void => {
          if (
            epoch !== vaultEpoch ||
            revision !== CryptoService.getRevision() ||
            !CryptoService.isUnlocked()
          )
            throw new StorageLockedError();
        };
        assertCurrent();
        set({ secretsLocked: false, passphraseEnabled: true });
        await get().persist();
        assertCurrent();
        await HistoryService.resealAll();
        assertCurrent();
        const version = historyVersion;
        const history = await HistoryService.listChats();
        assertCurrent();
        if (version === historyVersion) set({ history });
      });
      if (epoch === vaultEpoch) set({ hydrated: true, vaultBusy: false });
    } catch (error) {
      if (epoch === vaultEpoch) {
        const protectedVault = await CryptoService.hasPassphrase().catch(
          () => true
        );
        if (epoch === vaultEpoch) {
          if (protectedVault) get().lockSecrets();
          else set({ hydrated: true, vaultBusy: false });
        }
      }
      throw error;
    }
  },

  unlockSecrets: async (passphrase) => {
    if (get().vaultBusy) return false;
    const epoch = ++vaultEpoch;
    set({ hydrated: false, vaultBusy: true });
    try {
      const ok = await CryptoService.unlock(passphrase);
      if (epoch !== vaultEpoch) return false;
      if (!ok) {
        set({ hydrated: true, vaultBusy: false });
        return false;
      }
      const revision = CryptoService.getRevision();
      const assertCurrent = (): void => {
        if (
          epoch !== vaultEpoch ||
          revision !== CryptoService.getRevision() ||
          !CryptoService.isUnlocked()
        )
          throw new StorageLockedError();
      };
      await get().hydrate();
      assertCurrent();
      await queueHistory(async () => {
        assertCurrent();
        await HistoryService.resealAll();
      });
      assertCurrent();
      const version = historyVersion;
      const history = await HistoryService.listChats();
      assertCurrent();
      if (version === historyVersion) set({ history });
      set({ hydrated: true, vaultBusy: false });
      return true;
    } catch (error) {
      if (epoch === vaultEpoch) get().lockSecrets();
      throw error;
    }
  },

  lockSecrets: () => {
    vaultEpoch++;
    OperationService.cancel();
    for (const id of PROVIDER_ORDER) ModelService.invalidate(id);
    CryptoService.lock();
    set({
      secretsLocked: true,
      passphraseEnabled: true,
      providerConfigs: createEmptyConfigs(),
      history: [],
      messages: [],
      currentChatId: null,
      streamingContent: "",
      isStreaming: false,
      pendingAction: null,
      hydrated: true,
      vaultBusy: false,
    });
  },
}));
