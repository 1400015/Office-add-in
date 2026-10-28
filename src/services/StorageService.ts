import { logger } from "./LoggerService";

function storage(): OfficeRuntime.Storage {
  return OfficeRuntime.storage;
}

export const StorageService = {
  async getItem<T>(key: string): Promise<T | null> {
    try {
      const value = await storage().getItem(key);
      if (value === undefined || value === null) return null;
      return JSON.parse(value as string) as T;
    } catch (error) {
      logger.warn("storage", `Failed to read key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  async setItem(key: string, value: unknown): Promise<void> {
    await storage().setItem(key, JSON.stringify(value));
  },

  async removeItem(key: string): Promise<void> {
    await storage().removeItem(key);
  },

  async clear(): Promise<void> {
    const keys = await storage().getKeys();
    if (keys.length > 0) {
      await storage().removeItems(keys);
    }
  },
};
