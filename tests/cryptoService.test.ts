import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadCryptoService() {
  const mod = await import("../src/services/CryptoService");
  return mod.CryptoService;
}

function createMockStorage() {
  const map = new Map<string, string>();
  return {
    storage: {
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
    },
    map,
  };
}

const { storage: mock, map } = createMockStorage();

let CryptoService: Awaited<ReturnType<typeof loadCryptoService>>;

beforeEach(async () => {
  map.clear();
  vi.stubGlobal("OfficeRuntime", { storage: mock });
  vi.resetModules();
  CryptoService = await loadCryptoService();
});

describe("CryptoService", () => {
  it("encrypts to a prefixed payload that hides the plaintext", async () => {
    const secret = JSON.stringify({ apiKey: "sk-very-secret-123" });
    const encrypted = await CryptoService.encrypt(secret);
    expect(encrypted.startsWith("enc:v1:")).toBe(true);
    expect(encrypted).not.toContain("sk-very-secret-123");
  });

  it("decrypts back to the original plaintext (roundtrip)", async () => {
    const secret = JSON.stringify({ apiKey: "sk-very-secret-123" });
    const encrypted = await CryptoService.encrypt(secret);
    expect(await CryptoService.decrypt(encrypted)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const secret = "same input";
    const a = await CryptoService.encrypt(secret);
    const b = await CryptoService.encrypt(secret);
    expect(a).not.toBe(b);
  });

  it("isEncrypted detects the prefix", () => {
    expect(CryptoService.isEncrypted("enc:v1:abc:def")).toBe(true);
    expect(CryptoService.isEncrypted("plain text")).toBe(false);
  });

  it("decrypt passes through non-encrypted payloads (legacy data)", async () => {
    expect(await CryptoService.decrypt('{"legacy":true}')).toBe(
      '{"legacy":true}'
    );
  });

  it("isAvailable returns true when Web Crypto works", async () => {
    expect(await CryptoService.isAvailable()).toBe(true);
  });

  it("persists the salt so data survives re-encryption cycles", async () => {
    await CryptoService.encrypt("first");
    expect(map.has("ouai.cryptoSalt")).toBe(true);
    const salt1 = map.get("ouai.cryptoSalt");
    const encrypted = await CryptoService.encrypt("second");
    expect(await CryptoService.decrypt(encrypted)).toBe("second");
    expect(map.get("ouai.cryptoSalt")).toBe(salt1);
  });

  it("encrypts with the passphrase and refuses to decrypt while locked", async () => {
    await CryptoService.createPassphrase("correct horse");
    const encrypted = await CryptoService.encrypt("sk-real-secret");
    expect(encrypted.startsWith("enc:v2:")).toBe(true);
    expect(encrypted).not.toContain("sk-real-secret");
    CryptoService.lock();
    await expect(CryptoService.decrypt(encrypted)).rejects.toThrow(/locked/);
    expect(await CryptoService.unlock("wrong-pass")).toBe(false);
    expect(await CryptoService.unlock("correct horse")).toBe(true);
    expect(await CryptoService.decrypt(encrypted)).toBe("sk-real-secret");
  });

  it("rejects a short passphrase", async () => {
    await expect(CryptoService.createPassphrase("short")).rejects.toThrow(
      /passphrase-short/
    );
  });
});
