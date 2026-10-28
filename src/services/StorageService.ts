import { logger } from "./LoggerService";
import { CryptoService } from "./CryptoService";
import { STORAGE_KEYS } from "../constants";

const ENCRYPTED_KEYS = new Set<string>([STORAGE_KEYS.providerConfigs]);

function storage(): OfficeRuntime.Storage {
  return OfficeRuntime.storage;
}

export const StorageService = {
  async getItem<T>(key: string): Promise<T | null> {
    try {
      const value = await storage().getItem(key);
      if (value === undefined || value === null) return null;
      let text = value as string;
      if (ENCRYPTED_KEYS.has(key) && CryptoService.isEncrypted(text)) {
        text = await CryptoService.decrypt(text);
      }
      return JSON.parse(text) as T;
    } catch (error) {
      logger.warn("storage", `Failed to read key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  async setItem(key: string, value: unknown): Promise<void> {
    let text = JSON.stringify(value);
    if (ENCRYPTED_KEYS.has(key) && (await CryptoService.isAvailable())) {
      text = await CryptoService.encrypt(text);
    }
    await storage().setItem(key, text);
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
