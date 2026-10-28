import { logger } from "./LoggerService";

const ENC_PREFIX = "enc:v1:";
const SALT_KEY = "ouai.cryptoSalt";

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) {
    throw new Error("Web Crypto (crypto.subtle) is not available");
  }
  return s;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function buf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function storage(): OfficeRuntime.Storage {
  return OfficeRuntime.storage;
}

let keyPromise: Promise<CryptoKey> | null = null;

async function getOrCreateSalt(): Promise<Uint8Array> {
  const existing = await storage().getItem(SALT_KEY);
  if (existing) return fromBase64(existing as string);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await storage().setItem(SALT_KEY, toBase64(salt));
  return salt;
}

async function getOrCreateKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const salt = await getOrCreateSalt();
      const material = await subtle().importKey(
        "raw",
        new TextEncoder().encode(SALT_KEY).buffer as ArrayBuffer,
        "PBKDF2",
        false,
        ["deriveKey"]
      );
      return subtle().deriveKey(
        {
          name: "PBKDF2",
          salt: buf(salt),
          iterations: 100000,
          hash: "SHA-256",
        },
        material,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    })().catch((error) => {
      keyPromise = null;
      throw error;
    });
  }
  return keyPromise;
}

export const CryptoService = {
  async encrypt(plaintext: string): Promise<string> {
    const key = await getOrCreateKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await subtle().encrypt(
      { name: "AES-GCM", iv: buf(iv) },
      key,
      new TextEncoder().encode(plaintext)
    );
    return `${ENC_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`;
  },

  async decrypt(payload: string): Promise<string> {
    if (!payload.startsWith(ENC_PREFIX)) return payload;
    const [ivPart, dataPart] = payload.slice(ENC_PREFIX.length).split(":");
    if (!ivPart || !dataPart) {
      throw new Error("Malformed encrypted payload");
    }
    const key = await getOrCreateKey();
    const decrypted = await subtle().decrypt(
      { name: "AES-GCM", iv: buf(fromBase64(ivPart)) },
      key,
      buf(fromBase64(dataPart))
    );
    return new TextDecoder().decode(decrypted);
  },

  isEncrypted(value: string): boolean {
    return value.startsWith(ENC_PREFIX);
  },

  async isAvailable(): Promise<boolean> {
    try {
      const probe = await this.encrypt("probe");
      return this.isEncrypted(probe);
    } catch (error) {
      logger.warn("crypto", "Web Crypto unavailable; storing plain", {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  },
};
