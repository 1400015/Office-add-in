import { logger } from "./LoggerService";

const ENC_PREFIX = "enc:v1:";
const ENC_V2 = "enc:v2:";
const ENC_V3 = "enc:v3:";
const SALT_KEY = "ouai.cryptoSalt";
const PASSPHRASE_SALT = "ouai.passphraseSalt";
const PASSPHRASE_CHECK = "ouai.passphraseCheck";
const CHECK_PLAIN = "ouai-passphrase-ok";
const MIN_PASSPHRASE = 8;
// OWASP Password Storage Cheat Sheet: PBKDF2-HMAC-SHA256 >= 600 000 iterações.
const ITERATIONS_V1_V2 = 100_000;
const ITERATIONS_V3 = 600_000;

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
// Raw passphrase + salt kept only in memory so legacy v2 payloads can still
// be decrypted after unlock; cleared on lock().
let passphraseSecret = "";
let passphraseSalt: Uint8Array = new Uint8Array(0);
let protectionRevision = 0;
let creatingPassphrase = false;

async function deriveKey(
  secret: string,
  salt: Uint8Array,
  iterations: number = ITERATIONS_V1_V2
): Promise<CryptoKey> {
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
      iterations,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Passphrase keys derive with the current (v3) iteration count; legacy
// v1/v2 payloads are decrypted with the key derived at 100k iterations.
function derivePassphraseKey(
  secret: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  return deriveKey(secret, salt, iterations);
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
    const revision = protectionRevision;
    const protectedVault = await this.assertWritable(revision);
    const key = protectedVault ? passphraseKey : await getOrCreateKey();
    if (!key) throw new Error("locked");
    const result = await encryptWith(
      key,
      plaintext,
      protectedVault ? ENC_V3 : ENC_PREFIX
    );
    await this.assertWritable(revision);
    return result;
  },

  async decrypt(payload: string): Promise<string> {
    const revision = protectionRevision;
    // Passphrase-protected payloads: v3 uses the current 600k key, v2 is
    // legacy (100k) and must be re-encrypted to v3 on the next save.
    if (payload.startsWith(ENC_V3) || payload.startsWith(ENC_V2)) {
      if (!passphraseKey) throw new Error("locked");
      const prefix = payload.startsWith(ENC_V3) ? ENC_V3 : ENC_V2;
      const key =
        prefix === ENC_V3
          ? passphraseKey
          : await derivePassphraseKey(
              passphraseSecret,
              passphraseSalt,
              ITERATIONS_V1_V2
            );
      if (!key) throw new Error("locked");
      const plaintext = await decryptWith(key, payload, prefix);
      if (revision !== protectionRevision) throw new Error("locked");
      return plaintext;
    }
    if (!passphraseKey && (await this.hasPassphrase()))
      throw new Error("locked");
    const plaintext = payload.startsWith(ENC_PREFIX)
      ? await decryptWith(await getOrCreateKey(), payload, ENC_PREFIX)
      : payload;
    if (revision !== protectionRevision) throw new Error("locked");
    return plaintext;
  },

  isEncrypted(value: string): boolean {
    return (
      value.startsWith(ENC_PREFIX) ||
      value.startsWith(ENC_V2) ||
      value.startsWith(ENC_V3)
    );
  },

  isUnlocked(): boolean {
    return passphraseKey !== null;
  },

  getRevision(): number {
    return protectionRevision;
  },

  async assertWritable(revision: number): Promise<boolean> {
    if (revision !== protectionRevision || creatingPassphrase)
      throw new Error("locked");
    const hasPassphrase = await this.hasPassphrase();
    if (
      revision !== protectionRevision ||
      creatingPassphrase ||
      (hasPassphrase && !passphraseKey)
    ) {
      throw new Error("locked");
    }
    return hasPassphrase;
  },

  async hasPassphrase(): Promise<boolean> {
    const check = await storage().getItem(PASSPHRASE_CHECK);
    if (check === null || check === undefined) return false;
    if (
      typeof check !== "string" ||
      !(check.startsWith(ENC_V2) || check.startsWith(ENC_V3))
    ) {
      throw new Error("invalid passphrase protection state");
    }
    return true;
  },

  async createPassphrase(passphrase: string): Promise<void> {
    const secret = passphrase.trim();
    if (secret.length < MIN_PASSPHRASE) throw new Error("passphrase-short");
    if (creatingPassphrase) throw new Error("locked");
    creatingPassphrase = true;
    const revision = ++protectionRevision;
    try {
      if (await this.hasPassphrase()) throw new Error("passphrase-exists");
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey(secret, salt, ITERATIONS_V3);
      const check = await encryptWith(key, CHECK_PLAIN, ENC_V3);
      if (revision !== protectionRevision) throw new Error("locked");
      await storage().setItem(PASSPHRASE_SALT, toBase64(salt));
      if (revision !== protectionRevision) throw new Error("locked");
      await storage().setItem(PASSPHRASE_CHECK, check);
      if (revision !== protectionRevision) throw new Error("locked");
      passphraseKey = key;
      passphraseSecret = secret;
      passphraseSalt = salt;
    } finally {
      creatingPassphrase = false;
    }
  },

  async unlock(passphrase: string): Promise<boolean> {
    const revision = ++protectionRevision;
    const saltText = await storage().getItem(PASSPHRASE_SALT);
    const check = await storage().getItem(PASSPHRASE_CHECK);
    if (typeof saltText !== "string" || typeof check !== "string") return false;
    const salt = fromBase64(saltText);
    const secret = passphrase.trim();
    try {
      // The stored check may be v3 (600k) or legacy v2 (100k): try the
      // current count first, then fall back to the legacy count.
      const checkPrefix = check.startsWith(ENC_V3) ? ENC_V3 : ENC_V2;
      const iterations =
        checkPrefix === ENC_V3 ? ITERATIONS_V3 : ITERATIONS_V1_V2;
      const key = await deriveKey(secret, salt, iterations);
      const plain = await decryptWith(key, check, checkPrefix);
      if (plain !== CHECK_PLAIN) {
        // Retry with the other iteration count in case the prefix lies.
        const alt =
          iterations === ITERATIONS_V3 ? ITERATIONS_V1_V2 : ITERATIONS_V3;
        const altKey = await deriveKey(secret, salt, alt);
        const altPlain = await decryptWith(
          altKey,
          check,
          check.startsWith(ENC_V3) ? ENC_V3 : ENC_V2
        );
        if (altPlain !== CHECK_PLAIN) return false;
        if (revision !== protectionRevision) return false;
        passphraseKey = altKey;
        passphraseSecret = secret;
        passphraseSalt = salt;
        return true;
      }
      if (revision !== protectionRevision) return false;
      passphraseKey = key;
      passphraseSecret = secret;
      passphraseSalt = salt;
      return true;
    } catch {
      if (revision === protectionRevision) {
        passphraseKey = null;
        passphraseSecret = "";
        passphraseSalt = new Uint8Array(0);
      }
      return false;
    }
  },

  lock(): void {
    protectionRevision++;
    passphraseKey = null;
    passphraseSecret = "";
    passphraseSalt = new Uint8Array(0);
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
