import type { AIModel, ProviderConfig, ProviderId } from "../types";
import { createProvider } from "../providers/ProviderFactory";
import { PROVIDER_DEFINITIONS } from "../config/providers";
import { StorageService } from "./StorageService";
import { STORAGE_KEYS } from "../constants";
import { logger } from "./LoggerService";

const modelCache = new Map<ProviderId, AIModel[]>();

export const ModelService = {
  async listModels(
    config: ProviderConfig,
    forceRefresh = false
  ): Promise<AIModel[]> {
    if (!forceRefresh) {
      const cached = modelCache.get(config.id);
      if (cached) return cached;
    }
    const definition = PROVIDER_DEFINITIONS[config.id];
    if (!definition.supportsModelListing || !config.apiKey.trim()) {
      const fallback = definition.defaultModels.map((id) => ({
        id,
        name: id,
        provider: config.id,
      }));
      modelCache.set(config.id, fallback);
      return fallback;
    }
    try {
      const provider = createProvider(config);
      const models = await provider.getModels();
      modelCache.set(config.id, models);
      return models;
    } catch (error) {
      logger.warn("models", `Failed to list models for ${config.id}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      const fallback = definition.defaultModels.map((id) => ({
        id,
        name: id,
        provider: config.id,
      }));
      modelCache.set(config.id, fallback);
      return fallback;
    }
  },

  async getStoredActiveModel(provider: ProviderId): Promise<string | null> {
    const stored = await StorageService.getItem<Record<string, string>>(
      STORAGE_KEYS.activeModel
    );
    return stored?.[provider] ?? null;
  },

  async setStoredActiveModel(
    provider: ProviderId,
    model: string
  ): Promise<void> {
    const stored =
      (await StorageService.getItem<Record<string, string>>(
        STORAGE_KEYS.activeModel
      )) ?? {};
    stored[provider] = model;
    await StorageService.setItem(STORAGE_KEYS.activeModel, stored);
  },

  invalidate(provider: ProviderId): void {
    modelCache.delete(provider);
  },
};
