import { logger } from "./LoggerService";

const ENC_PREFIX = "enc:v1:";
const ENC_V2 = "enc:v2:";
const SALT_KEY = "ouai.cryptoSalt";
const PASSPHRASE_SALT = "ouai.passphraseSalt";
const PASSPHRASE_CHECK = "ouai.passphraseCheck";
const CHECK_PLAIN = "ouai-passphrase-ok";
const MIN_PASSPHRASE = 8;

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
let passphraseKey: CryptoKey | null = null;

async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await subtle().importKey(
    "raw",
    new TextEncoder().encode(secret).buffer as ArrayBuffer,
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
}

async function encryptWith(
  key: CryptoKey,
  plaintext: string,
  prefix: string
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await subtle().encrypt(
    { name: "AES-GCM", iv: buf(iv) },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${prefix}${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`;
}

async function decryptWith(
  key: CryptoKey,
  payload: string,
  prefix: string
): Promise<string> {
  const [ivPart, dataPart] = payload.slice(prefix.length).split(":");
  if (!ivPart || !dataPart) throw new Error("Malformed encrypted payload");
  const decrypted = await subtle().decrypt(
    { name: "AES-GCM", iv: buf(fromBase64(ivPart)) },
    key,
    buf(fromBase64(dataPart))
  );
  return new TextDecoder().decode(decrypted);
}

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
      return deriveKey(SALT_KEY, salt);
    })().catch((error) => {
      keyPromise = null;
      throw error;
    });
  }
  return keyPromise;
}

export const CryptoService = {
  async encrypt(plaintext: string): Promise<string> {
    if (passphraseKey) return encryptWith(passphraseKey, plaintext, ENC_V2);
    return encryptWith(await getOrCreateKey(), plaintext, ENC_PREFIX);
  },

  async decrypt(payload: string): Promise<string> {
    if (payload.startsWith(ENC_V2)) {
      if (!passphraseKey) throw new Error("locked");
      return decryptWith(passphraseKey, payload, ENC_V2);
    }
    if (!payload.startsWith(ENC_PREFIX)) return payload;
    return decryptWith(await getOrCreateKey(), payload, ENC_PREFIX);
  },

  isEncrypted(value: string): boolean {
    return value.startsWith(ENC_PREFIX) || value.startsWith(ENC_V2);
  },

  isUnlocked(): boolean {
    return passphraseKey !== null;
  },

  async hasPassphrase(): Promise<boolean> {
    const check = await storage().getItem(PASSPHRASE_CHECK);
    return typeof check === "string" && check.startsWith(ENC_V2);
  },

  async createPassphrase(passphrase: string): Promise<void> {
    const secret = passphrase.trim();
    if (secret.length < MIN_PASSPHRASE) throw new Error("passphrase-short");
    if (await this.hasPassphrase()) throw new Error("passphrase-exists");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    await storage().setItem(PASSPHRASE_SALT, toBase64(salt));
    passphraseKey = await deriveKey(secret, salt);
    await storage().setItem(
      PASSPHRASE_CHECK,
      await encryptWith(passphraseKey, CHECK_PLAIN, ENC_V2)
    );
  },

  async unlock(passphrase: string): Promise<boolean> {
    const saltText = await storage().getItem(PASSPHRASE_SALT);
    const check = await storage().getItem(PASSPHRASE_CHECK);
    if (typeof saltText !== "string" || typeof check !== "string") return false;
    try {
      const key = await deriveKey(passphrase.trim(), fromBase64(saltText));
      const plain = await decryptWith(key, check, ENC_V2);
      if (plain !== CHECK_PLAIN) return false;
      passphraseKey = key;
      return true;
    } catch {
      passphraseKey = null;
      return false;
    }
  },

  lock(): void {
    passphraseKey = null;
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
