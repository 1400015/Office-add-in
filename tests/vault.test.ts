import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("idb", () => {
  const db = {
    put: vi.fn(async () => {}),
    get: vi.fn(async () => undefined),
    getAllFromIndex: vi.fn(async () => []),
    getAll: vi.fn(async () => []),
    getAllKeys: vi.fn(async () => []),
    delete: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    transaction: vi.fn(() => ({
      store: { delete: vi.fn() },
      done: Promise.resolve(),
    })),
  };
  return { openDB: vi.fn(async () => db) };
});

import {
  StorageService,
  StorageLockedError,
} from "../src/services/StorageService";
import { useAppStore } from "../src/store/useAppStore";
import { STORAGE_KEYS } from "../src/constants";

const SEALED = "enc:v2:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBB";

function createMockStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  const storage = {
    getItem: vi.fn(async (key: string) => map.get(key)),
    setItem: vi.fn(async (key: string, value: string) => {
      map.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      map.delete(key);
    }),
    getKeys: vi.fn(async () => Array.from(map.keys())),
    removeItems: vi.fn(async (keys: string[]) => {
      for (const key of keys) map.delete(key);
    }),
  };
  return { map, storage };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("locked vault", () => {
  it("throws instead of returning null for a sealed payload", async () => {
    const { storage } = createMockStorage({
      [STORAGE_KEYS.providerConfigs]: SEALED,
    });
    vi.stubGlobal("OfficeRuntime", { storage });

    await expect(
      StorageService.getItem(STORAGE_KEYS.providerConfigs)
    ).rejects.toBeInstanceOf(StorageLockedError);
  });

  it("refuses to overwrite a sealed payload while locked", async () => {
    const { map, storage } = createMockStorage({
      [STORAGE_KEYS.providerConfigs]: SEALED,
      "ouai.passphraseCheck": SEALED,
    });
    vi.stubGlobal("OfficeRuntime", { storage });

    await expect(
      StorageService.setItem(STORAGE_KEYS.providerConfigs, { mistral: {} })
    ).rejects.toBeInstanceOf(StorageLockedError);
    expect(map.get(STORAGE_KEYS.providerConfigs)).toBe(SEALED);
  });

  it("hydrate reports the lock and persist keeps the sealed configs", async () => {
    const { map, storage } = createMockStorage({
      [STORAGE_KEYS.providerConfigs]: SEALED,
      "ouai.passphraseCheck": SEALED,
      "ouai.passphraseSalt": "c2FsdA==",
      [STORAGE_KEYS.activeProvider]: JSON.stringify("mistral"),
    });
    vi.stubGlobal("OfficeRuntime", { storage });

    await useAppStore.getState().hydrate();
    const state = useAppStore.getState();

    expect(state.secretsLocked).toBe(true);
    expect(state.passphraseEnabled).toBe(true);
    expect(state.providerConfigs.mistral.apiKey).toBe("");

    storage.setItem.mockClear();
    await state.persist();

    expect(storage.setItem).not.toHaveBeenCalledWith(
      STORAGE_KEYS.providerConfigs,
      expect.anything()
    );
    expect(map.get(STORAGE_KEYS.providerConfigs)).toBe(SEALED);
  });
});
