import { logger } from "./LoggerService";
import { CryptoService } from "./CryptoService";
import { STORAGE_KEYS } from "../constants";

const ENCRYPTED_KEYS = new Set<string>([STORAGE_KEYS.providerConfigs]);

export class StorageLockedError extends Error {
  constructor() {
    super("locked");
    this.name = "StorageLockedError";
  }
}

function storage(): OfficeRuntime.Storage {
  return OfficeRuntime.storage;
}

export const StorageService = {
  async getItem<T>(key: string): Promise<T | null> {
    let value: unknown;
    try {
      value = await storage().getItem(key);
    } catch (error) {
      logger.warn("storage", `Failed to read key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }

    if (value === undefined || value === null) return null;

    let text = value as string;
    if (ENCRYPTED_KEYS.has(key) && CryptoService.isEncrypted(text)) {
      try {
        text = await CryptoService.decrypt(text);
      } catch (error) {
        if (error instanceof Error && error.message === "locked") {
          // Never mask a locked vault: callers must know they cannot read
          // the stored secrets, otherwise they could overwrite them.
          throw new StorageLockedError();
        }
        logger.warn("storage", `Failed to decrypt key ${key}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    }

    try {
      return JSON.parse(text) as T;
    } catch (error) {
      logger.warn("storage", `Failed to parse key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  async setItem(key: string, value: unknown): Promise<void> {
    if (
      ENCRYPTED_KEYS.has(key) &&
      !CryptoService.isUnlocked() &&
      (await CryptoService.hasPassphrase())
    ) {
      // Writing now would replace the sealed payload with a different key.
      throw new StorageLockedError();
    }
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
