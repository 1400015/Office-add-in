import type { AIModel, ProviderConfig, ProviderId } from "../types";
import { createProvider } from "../providers/ProviderFactory";
import { PROVIDER_DEFINITIONS } from "../config/providers";
import { StorageService } from "./StorageService";
import { STORAGE_KEYS } from "../constants";
import { logger } from "./LoggerService";

export interface ModelListResult {
  models: AIModel[];
  source: "remote" | "cache" | "fallback";
  warningKey?: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
interface CacheEntry {
  config: ProviderConfig;
  models: AIModel[];
  fetchedAt: number;
}
const modelCache = new Map<ProviderId, CacheEntry>();
const revisions = new Map<ProviderId, number>();
const activeConfigs = new Map<ProviderId, ProviderConfig>();
let modelWrites: Promise<void> = Promise.resolve();

function sameConfig(a: ProviderConfig, b: ProviderConfig): boolean {
  return (
    a.id === b.id &&
    a.endpoint === b.endpoint &&
    a.apiKey === b.apiKey &&
    a.proxyUrl === b.proxyUrl &&
    a.useProxy === b.useProxy &&
    a.timeout === b.timeout
  );
}
function advance(id: ProviderId): number {
  const next = (revisions.get(id) ?? 0) + 1;
  revisions.set(id, next);
  return next;
}
function fallback(config: ProviderConfig): ModelListResult {
  return {
    models:
      config.id === "ollama"
        ? []
        : PROVIDER_DEFINITIONS[config.id].defaultModels.map((id) => ({
            id,
            name: id,
            provider: config.id,
          })),
    source: "fallback",
    warningKey: "selectors.modelsFallback",
  };
}

export const ModelService = {
  async listModels(
    config: ProviderConfig,
    forceRefresh = false,
    signal?: AbortSignal
  ): Promise<ModelListResult> {
    const previous = activeConfigs.get(config.id);
    if (!previous || !sameConfig(previous, config)) {
      activeConfigs.set(config.id, { ...config });
      advance(config.id);
      modelCache.delete(config.id);
    } else if (forceRefresh) advance(config.id);
    const revision = revisions.get(config.id) ?? 0;
    const cached = modelCache.get(config.id);
    if (
      !forceRefresh &&
      cached &&
      sameConfig(cached.config, config) &&
      Date.now() - cached.fetchedAt < CACHE_TTL_MS
    ) {
      return { models: cached.models, source: "cache" };
    }
    if (!config.apiKey.trim() && config.id !== "ollama")
      return fallback(config);
    try {
      const models = await createProvider(config).getModels(signal);
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (
        revisions.get(config.id) === revision &&
        sameConfig(activeConfigs.get(config.id)!, config)
      ) {
        modelCache.set(config.id, {
          config: { ...config },
          models,
          fetchedAt: Date.now(),
        });
      }
      return { models, source: "remote" };
    } catch (error) {
      if (signal?.aborted) throw error;
      logger.warn("models", `Failed to list models for ${config.id}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      if (cached && sameConfig(cached.config, config))
        return {
          models: cached.models,
          source: "cache",
          warningKey: "selectors.modelsFallback",
        };
      return fallback(config);
    }
  },

  async probeConnection(
    config: ProviderConfig,
    signal?: AbortSignal
  ): Promise<{ modelCount?: number }> {
    return createProvider(config).probeConnection(signal);
  },

  async getStoredActiveModel(provider: ProviderId): Promise<string | null> {
    // A previous failed write must not permanently prevent reads. The error is
    // already reported to the caller that requested that write.
    await modelWrites.catch(() => {});
    const stored = await StorageService.getItem<Record<string, string>>(
      STORAGE_KEYS.activeModel
    );
    return stored?.[provider] ?? null;
  },

  async setStoredActiveModel(
    provider: ProviderId,
    model: string
  ): Promise<void> {
    const operation = modelWrites
      .catch(() => {})
      .then(async () => {
        const stored =
          (await StorageService.getItem<Record<string, string>>(
            STORAGE_KEYS.activeModel
          )) ?? {};
        stored[provider] = model;
        await StorageService.setItem(STORAGE_KEYS.activeModel, stored);
      });
    modelWrites = operation;
    return operation;
  },

  invalidate(provider: ProviderId): void {
    advance(provider);
    modelCache.delete(provider);
    activeConfigs.delete(provider);
  },
};
