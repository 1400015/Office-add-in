import { beforeEach, describe, expect, it, vi } from "vitest";
import { StorageService } from "../src/services/StorageService";
import { STORAGE_KEYS } from "../src/constants";

function createMockStorage() {
  const map = new Map<string, string>();
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
  return { storage, map };
}

const { storage: mock, map } = createMockStorage();

beforeEach(() => {
  map.clear();
  mock.getItem.mockClear();
  mock.setItem.mockClear();
  mock.removeItem.mockClear();
  mock.getKeys.mockClear();
  mock.removeItems.mockClear();
  vi.stubGlobal("OfficeRuntime", { storage: mock });
});

describe("StorageService", () => {
  it("stores and reads a value (roundtrip)", async () => {
    await StorageService.setItem("settings", { theme: "dark" });
    const value = await StorageService.getItem<{ theme: string }>("settings");
    expect(value).toEqual({ theme: "dark" });
  });

  it("returns null for missing keys", async () => {
    const value = await StorageService.getItem<string>("nonexistent");
    expect(value).toBeNull();
  });

  it("serializes objects as JSON", async () => {
    await StorageService.setItem("obj", { a: 1, b: [1, 2] });
    expect(mock.setItem).toHaveBeenCalledWith(
      "obj",
      JSON.stringify({ a: 1, b: [1, 2] })
    );
  });

  it("removes an item", async () => {
    await StorageService.setItem("gone", "x");
    await StorageService.removeItem("gone");
    const value = await StorageService.getItem<string>("gone");
    expect(value).toBeNull();
  });

  it("clears all keys", async () => {
    await StorageService.setItem("a", "1");
    await StorageService.setItem("b", "2");
    await StorageService.clear();
    expect(await StorageService.getItem<string>("a")).toBeNull();
    expect(await StorageService.getItem<string>("b")).toBeNull();
    expect(mock.removeItems).toHaveBeenCalled();
  });

  it("returns null on invalid JSON instead of throwing", async () => {
    mock.getItem.mockResolvedValueOnce("not-json{{");
    const value = await StorageService.getItem<string>("broken");
    expect(value).toBeNull();
  });

  it("encrypts providerConfigs at rest (API keys never in plain text)", async () => {
    const configs = { mistral: { apiKey: "sk-topsecret-abc123" } };
    await StorageService.setItem(STORAGE_KEYS.providerConfigs, configs);
    const raw = map.get(STORAGE_KEYS.providerConfigs)!;
    expect(raw.startsWith("enc:v1:")).toBe(true);
    expect(raw).not.toContain("sk-topsecret-abc123");
  });

  it("roundtrips encrypted providerConfigs transparently", async () => {
    const configs = { mistral: { apiKey: "sk-topsecret-abc123" } };
    await StorageService.setItem(STORAGE_KEYS.providerConfigs, configs);
    const value = await StorageService.getItem<typeof configs>(
      STORAGE_KEYS.providerConfigs
    );
    expect(value).toEqual(configs);
  });

  it("still reads legacy plain-text providerConfigs (migration)", async () => {
    map.set(STORAGE_KEYS.providerConfigs, JSON.stringify({ legacy: true }));
    const value = await StorageService.getItem<Record<string, unknown>>(
      STORAGE_KEYS.providerConfigs
    );
    expect(value).toEqual({ legacy: true });
  });

  it("does not encrypt non-sensitive keys", async () => {
    await StorageService.setItem(STORAGE_KEYS.theme, "dark");
    expect(map.get(STORAGE_KEYS.theme)).toBe('"dark"');
  });

  it("returns null when storage read fails", async () => {
    mock.getItem.mockRejectedValueOnce(new Error("storage unavailable"));
    const value = await StorageService.getItem<string>("fail");
    expect(value).toBeNull();
  });
});
