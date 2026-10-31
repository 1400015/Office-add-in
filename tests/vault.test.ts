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

  it("does not overwrite sealed keys if a save runs while unlocking", async () => {
    const { map, storage } = createMockStorage();
    vi.stubGlobal("OfficeRuntime", { storage });
    const store = useAppStore.getState();
    await store.createPassphrase("correct-horse");
    useAppStore
      .getState()
      .updateProviderConfig("mistral", { apiKey: "sk-keep" });
    await useAppStore.getState().persist();
    useAppStore.getState().lockSecrets();

    let armed = true;
    storage.getItem.mockImplementation(async (key: string) => {
      if (armed && key === STORAGE_KEYS.providerConfigs) {
        armed = false;
        await useAppStore.getState().persist();
      }
      return map.get(key);
    });

    const ok = await useAppStore.getState().unlockSecrets("correct-horse");
    expect(ok).toBe(true);
    expect(useAppStore.getState().secretsLocked).toBe(false);
    expect(useAppStore.getState().providerConfigs.mistral.apiKey).toBe(
      "sk-keep"
    );

    const { CryptoService } = await import("../src/services/CryptoService");
    const stored = map.get(STORAGE_KEYS.providerConfigs) ?? "";
    const parsed = JSON.parse(await CryptoService.decrypt(stored)) as {
      mistral: { apiKey: string };
    };
    expect(parsed.mistral.apiKey).toBe("sk-keep");
    CryptoService.lock();
  });

  it("does not restore decrypted settings when locking during hydration", async () => {
    const { storage } = createMockStorage();
    vi.stubGlobal("OfficeRuntime", { storage });
    const { CryptoService } = await import("../src/services/CryptoService");
    CryptoService.lock();
    await useAppStore.getState().createPassphrase("correct-horse");
    useAppStore
      .getState()
      .updateProviderConfig("mistral", { apiKey: "sk-private" });
    await useAppStore.getState().persist();

    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = storage.getItem.getMockImplementation()!;
    storage.getItem.mockImplementation(async (key: string) => {
      if (key === STORAGE_KEYS.activeProvider) {
        started();
        await blocked;
      }
      return original(key);
    });
    const hydrating = useAppStore.getState().hydrate();
    await waiting;
    useAppStore.getState().lockSecrets();
    release();
    await hydrating;
    expect(useAppStore.getState().secretsLocked).toBe(true);
    expect(useAppStore.getState().providerConfigs.mistral.apiKey).toBe("");
    expect(useAppStore.getState().history).toEqual([]);
  });

  it("keeps a failed migration locked and completes it after unlock", async () => {
    const { storage } = createMockStorage();
    vi.stubGlobal("OfficeRuntime", { storage });
    const { CryptoService } = await import("../src/services/CryptoService");
    CryptoService.lock();
    const { openDB } = await import("idb");
    const db = await openDB("mock", 1);
    vi.mocked(db.getAllFromIndex).mockRejectedValueOnce(
      new Error("migration failed")
    );

    await expect(
      useAppStore.getState().createPassphrase("correct-horse")
    ).rejects.toThrow("migration failed");
    expect(useAppStore.getState().secretsLocked).toBe(true);
    expect(useAppStore.getState().passphraseEnabled).toBe(true);
    expect(await useAppStore.getState().unlockSecrets("correct-horse")).toBe(
      true
    );
    expect(useAppStore.getState().secretsLocked).toBe(false);
    CryptoService.lock();
  });
});
