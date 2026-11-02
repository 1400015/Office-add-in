import { create } from "zustand";
import type {
  AIModel,
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
import {
  ModelService,
  sameConfig,
  type ModelListResult,
} from "../services/ModelService";
import { defaultChatModel } from "../services/modelCompatibility";
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

interface ModelCatalogState {
  status: "idle" | "loading" | "ready" | "error";
  generation: number;
  requestId: number;
  provider: ProviderId;
  configRevision: number;
  reason: "initial" | "config" | "provider" | "refresh" | "session";
  models: AIModel[];
  source?: ModelListResult["source"];
  warningKey?: string;
  error?: string;
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
  modelCatalog: ModelCatalogState;
  modelPreferences: Partial<Record<ProviderId, string>>;
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
  historyBusy: boolean;
  secretsLocked: boolean;
  passphraseEnabled: boolean;

  setOfficeInfo: (host: OfficeHost, platform: OfficePlatform) => void;
  updateProviderConfig: (
    id: ProviderId,
    patch: Partial<ProviderConfig>
  ) => void;
  setActiveProvider: (id: ProviderId) => void;
  setActiveModel: (model: string) => void;
  refreshModels: () => void;
  loadModelCatalog: (signal: AbortSignal) => Promise<void>;
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
let catalogGeneration = 0;
let catalogRequest = 0;
let modelSelectionRevision = 0;
const configRevisions = new Map<ProviderId, number>();

function invalidateModelCatalog(
  provider: ProviderId,
  reason: ModelCatalogState["reason"]
): ModelCatalogState {
  ++modelSelectionRevision;
  return {
    status: "idle",
    generation: ++catalogGeneration,
    requestId: 0,
    provider,
    configRevision: configRevisions.get(provider) ?? 0,
    reason,
    models: [],
  };
}

function selectableModel(model: AIModel): boolean {
  return (
    model.chatCompatibility === "supported" ||
    model.chatCompatibility === "unknown" ||
    model.chatCompatibility === undefined
  );
}

export function isModelReady(state: AppState): boolean {
  const catalog = state.modelCatalog;
  return (
    state.officeReady &&
    state.hydrated &&
    !state.vaultBusy &&
    !state.secretsLocked &&
    catalog.status === "ready" &&
    catalog.provider === state.activeProvider &&
    catalog.configRevision ===
      (configRevisions.get(state.activeProvider) ?? 0) &&
    catalog.models.some(
      (model) => model.id === state.activeModel && selectableModel(model)
    )
  );
}

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
  modelCatalog: invalidateModelCatalog("mistral", "initial"),
  modelPreferences: {},
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
  historyBusy: false,
  secretsLocked: false,
  passphraseEnabled: false,

  setOfficeInfo: (host, platform) => set({ host, platform, officeReady: true }),

  updateProviderConfig: (id, patch) => {
    const state = get();
    const config = { ...state.providerConfigs[id], ...patch, id };
    if (sameConfig(state.providerConfigs[id], config)) return;
    ModelService.invalidate(id);
    configRevisions.set(id, (configRevisions.get(id) ?? 0) + 1);
    set({
      providerConfigs: {
        ...state.providerConfigs,
        [id]: config,
      },
      ...(id === state.activeProvider
        ? {
            activeModel: "",
            modelCatalog: invalidateModelCatalog(id, "config"),
          }
        : {}),
    });
  },
  setActiveProvider: (id) => {
    const state = get();
    if (
      !PROVIDER_ORDER.includes(id) ||
      state.activeProvider === id ||
      !state.hydrated ||
      state.secretsLocked ||
      state.vaultBusy
    )
      return;
    set({
      activeProvider: id,
      activeModel: "",
      modelCatalog: invalidateModelCatalog(id, "provider"),
    });
    const session = vaultEpoch;
    const current = (): boolean =>
      vaultEpoch === session &&
      get().activeProvider === id &&
      !get().secretsLocked &&
      !get().vaultBusy;
    void queueSettings(async () => {
      if (current())
        await StorageService.setItem(STORAGE_KEYS.activeProvider, id);
    }).catch(() => {
      if (current()) set({ error: "errors.generic" });
    });
  },
  setActiveModel: (model) => {
    const state = get();
    const catalog = state.modelCatalog;
    if (
      !state.officeReady ||
      !state.hydrated ||
      state.secretsLocked ||
      state.vaultBusy ||
      catalog.status !== "ready" ||
      catalog.provider !== state.activeProvider ||
      catalog.configRevision !==
        (configRevisions.get(state.activeProvider) ?? 0) ||
      !catalog.models.some((item) => item.id === model && selectableModel(item))
    )
      return;
    const selection = ++modelSelectionRevision;
    const session = vaultEpoch;
    set({
      activeModel: model,
      modelPreferences: {
        ...state.modelPreferences,
        [state.activeProvider]: model,
      },
    });
    const current = (): boolean =>
      vaultEpoch === session &&
      modelSelectionRevision === selection &&
      get().modelCatalog.generation === catalog.generation &&
      isModelReady(get());
    void ModelService.setStoredActiveModel(
      state.activeProvider,
      model,
      current
    ).catch(() => {
      if (current()) set({ error: "errors.generic" });
    });
  },
  refreshModels: () => {
    const state = get();
    ModelService.invalidate(state.activeProvider);
    set({
      activeModel: "",
      modelCatalog: invalidateModelCatalog(state.activeProvider, "refresh"),
    });
  },
  loadModelCatalog: async (signal) => {
    const state = get();
    if (
      !state.officeReady ||
      !state.hydrated ||
      state.secretsLocked ||
      state.vaultBusy ||
      signal.aborted
    )
      return;
    const catalog = state.modelCatalog;
    const provider = state.activeProvider;
    const config = { ...state.providerConfigs[provider] };
    const session = vaultEpoch;
    const cryptoRevision = CryptoService.getRevision();
    const requestId = ++catalogRequest;
    const current = (): boolean => {
      const next = get();
      return (
        !signal.aborted &&
        vaultEpoch === session &&
        CryptoService.getRevision() === cryptoRevision &&
        next.officeReady &&
        next.hydrated &&
        !next.secretsLocked &&
        !next.vaultBusy &&
        next.activeProvider === provider &&
        next.modelCatalog.generation === catalog.generation &&
        next.modelCatalog.requestId === requestId &&
        (configRevisions.get(provider) ?? 0) === catalog.configRevision
      );
    };
    set({
      activeModel: "",
      modelCatalog: {
        ...catalog,
        requestId,
        status: "loading",
        error: undefined,
      },
    });
    try {
      const [result, stored] = await Promise.all([
        ModelService.listModels(config, catalog.reason === "refresh", signal),
        ModelService.getStoredActiveModel(provider),
      ]);
      if (!current()) return;
      const models = result.models.filter(
        (model) => model.provider === provider && selectableModel(model)
      );
      const preference = [get().modelPreferences[provider], stored].find(
        (id) => id && models.some((model) => model.id === id)
      );
      const chosen = preference || defaultChatModel(models, provider);
      const selection = ++modelSelectionRevision;
      set((next) => ({
        activeModel: chosen,
        modelPreferences: chosen
          ? { ...next.modelPreferences, [provider]: chosen }
          : next.modelPreferences,
        modelCatalog: {
          ...catalog,
          requestId,
          status: "ready",
          models,
          source: result.source,
          warningKey: result.warningKey,
        },
      }));
      if (chosen) {
        // Always enqueue the accepted preference: an older dispatched write
        // may still be finishing even if the stored read already matched it.
        const selectionCurrent = (): boolean =>
          current() &&
          modelSelectionRevision === selection &&
          get().activeModel === chosen;
        try {
          await ModelService.setStoredActiveModel(
            provider,
            chosen,
            selectionCurrent
          );
        } catch {
          if (selectionCurrent()) set({ error: "errors.generic" });
        }
      }
    } catch {
      if (current())
        set({
          activeModel: "",
          error: "errors.modelCatalogFailed",
          modelCatalog: {
            ...catalog,
            requestId,
            status: "error",
            error: "errors.modelCatalogFailed",
          },
        });
    }
  },
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
      const writes: Array<() => Promise<void>> = [
        () =>
          StorageService.setItem(
            STORAGE_KEYS.activeProvider,
            state.activeProvider
          ),
        () =>
          StorageService.setItem(STORAGE_KEYS.temperature, state.temperature),
        () => StorageService.setItem(STORAGE_KEYS.maxTokens, state.maxTokens),
        () => StorageService.setItem(STORAGE_KEYS.reasoning, state.reasoning),
        () =>
          StorageService.setItem(STORAGE_KEYS.systemPrompt, state.systemPrompt),
        () => StorageService.setItem(STORAGE_KEYS.theme, state.theme),
        () => StorageService.setItem(STORAGE_KEYS.language, state.language),
      ];
      if (!state.secretsLocked) {
        writes.push(() =>
          StorageService.setItem(
            STORAGE_KEYS.providerConfigs,
            state.providerConfigs
          )
        );
      }
      // Keep this queue entry alive even if a sibling write fails early.
      // Thunks also turn synchronous startup errors into settled results.
      const results = await Promise.allSettled(
        writes.map((write) => Promise.resolve().then(write))
      );
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
      }
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
    const session = vaultEpoch;
    const cryptoRevision = CryptoService.getRevision();
    let version = historyVersion;
    let saved = false;
    const revision = chatRevisions.get(id) ?? 0;
    const current = (): boolean =>
      historyEpoch === epoch &&
      vaultEpoch === session &&
      CryptoService.getRevision() === cryptoRevision &&
      (chatRevisions.get(id) ?? 0) === revision &&
      !get().secretsLocked &&
      !get().vaultBusy;
    const chat: ChatHistory = {
      id,
      timestamp: Date.now(),
      provider,
      model,
      title: messages[0]?.content.slice(0, 60) ?? "New chat",
      messages: [...messages],
    };
    try {
      await queueHistory(async () => {
        if (!current()) return;
        await HistoryService.saveChat(chat);
        // A confirmed mutation invalidates older reads even if the session
        // changed while storage was completing it.
        version = ++historyVersion;
        saved = true;
      });
      if (!saved || !current() || historyVersion !== version) return;
      const history = await HistoryService.listChats();
      if (current() && historyVersion === version) set({ history });
    } catch (error) {
      if (current()) throw error;
    }
  },

  deleteConversation: async (id) => {
    ++historyVersion;
    const revision = (chatRevisions.get(id) ?? 0) + 1;
    chatRevisions.set(id, revision);
    pendingDeletions.set(id, revision);
    set({ historyBusy: true });
    if (get().currentChatId === id) get().startNewChat();
    try {
      await queueHistory(async () => {
        await HistoryService.deleteChat(id);
        // Invalidate lists read while the mutation was pending. Remove only
        // committed data inside the queue, before newer saves can run; this
        // never republishes a snapshot from an earlier vault or conversation.
        ++historyVersion;
        set((state) => ({
          history: state.history.filter((chat) => chat.id !== id),
        }));
      });
    } finally {
      if (pendingDeletions.get(id) === revision) pendingDeletions.delete(id);
      set({ historyBusy: clearingHistory || pendingDeletions.size > 0 });
    }
  },

  clearHistory: async () => {
    const epoch = ++historyEpoch;
    clearingHistory = true;
    set({ historyBusy: true });
    ++historyVersion;
    get().startNewChat();
    try {
      await queueHistory(async () => {
        await HistoryService.clear();
        // This runs inside the queue, before any newer conversation can save.
        // Do not hide records until the database has confirmed their removal.
        ++historyVersion;
        set({ history: [] });
      });
    } finally {
      if (historyEpoch === epoch) clearingHistory = false;
      set({ historyBusy: clearingHistory || pendingDeletions.size > 0 });
    }
  },

  hydrate: async () => {
    const serial = ++hydrationSerial;
    const epoch = vaultEpoch;
    const revision = CryptoService.getRevision();
    const initialHistoryVersion = historyVersion;
    set({
      hydrated: false,
      activeModel: "",
      modelCatalog: invalidateModelCatalog(get().activeProvider, "session"),
    });
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
      history,
    ] = await Promise.all([
      StorageService.getItem<ProviderId>(STORAGE_KEYS.activeProvider),
      StorageService.getItem<number>(STORAGE_KEYS.temperature),
      StorageService.getItem<number>(STORAGE_KEYS.maxTokens),
      StorageService.getItem<ReasoningLevel>(STORAGE_KEYS.reasoning),
      StorageService.getItem<string>(STORAGE_KEYS.systemPrompt),
      StorageService.getItem<ThemeMode>(STORAGE_KEYS.theme),
      StorageService.getItem<string>(STORAGE_KEYS.language),
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

    const provider =
      activeProvider && PROVIDER_ORDER.includes(activeProvider)
        ? activeProvider
        : "mistral";
    if (
      serial !== hydrationSerial ||
      epoch !== vaultEpoch ||
      revision !== CryptoService.getRevision()
    )
      return;
    for (const id of PROVIDER_ORDER) {
      configRevisions.set(id, (configRevisions.get(id) ?? 0) + 1);
      ModelService.invalidate(id);
    }
    set({
      providerConfigs: mergedConfigs,
      activeProvider: provider,
      activeModel: "",
      // The catalog reads preferences through modelWrites' barrier. A direct
      // hydration read could precede a dispatched preference from before lock.
      modelPreferences: {},
      modelCatalog: invalidateModelCatalog(provider, "session"),
      temperature: temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: maxTokens ?? DEFAULT_MAX_TOKENS,
      reasoning: reasoning ?? "medium",
      systemPrompt: systemPrompt ?? "",
      theme: theme ?? "auto",
      language: language ?? detectLanguage(),
      history:
        initialHistoryVersion === historyVersion ? history : get().history,
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
      activeModel: "",
      modelCatalog: invalidateModelCatalog(get().activeProvider, "session"),
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
    set({
      hydrated: false,
      vaultBusy: true,
      activeModel: "",
      modelCatalog: invalidateModelCatalog(get().activeProvider, "session"),
    });
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
      if (get().secretsLocked) throw new StorageLockedError();
      const configs = get().providerConfigs;
      // Creation can be interrupted after the passphrase marker is written
      // but before legacy credentials are protected. Resume that migration
      // using the loaded snapshot, rather than rereading mutable UI state
      // after waiting for earlier settings writes.
      await queueSettings(async () => {
        assertCurrent();
        await StorageService.setItem(STORAGE_KEYS.providerConfigs, configs);
        assertCurrent();
      });
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
      activeModel: "",
      modelPreferences: {},
      modelCatalog: invalidateModelCatalog(get().activeProvider, "session"),
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
