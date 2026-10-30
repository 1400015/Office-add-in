export interface PassphraseOutcome {
  /** Whether the password field should reset after the attempt. */
  clearInput: boolean;
  /** Translation key for the failure banner, or null on success. */
  errorKey: string | null;
}

export interface PassphraseDeps {
  passphraseEnabled: boolean;
  create: (passphrase: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<boolean>;
}

/**
 * Submit the passphrase field: create the vault on first use, otherwise
 * unlock it. Unexpected errors (e.g. "passphrase-short") propagate to the
 * caller, which maps them with passphraseErrorKey.
 */
export async function submitPassphrase(
  phrase: string,
  deps: PassphraseDeps
): Promise<PassphraseOutcome> {
  if (!deps.passphraseEnabled) {
    await deps.create(phrase);
    return { clearInput: true, errorKey: null };
  }
  const ok = await deps.unlock(phrase);
  return ok
    ? { clearInput: true, errorKey: null }
    : { clearInput: false, errorKey: "settings.passphraseWrong" };
}

/** Map a store error code to the banner translation key. */
export function passphraseErrorKey(code: string): string {
  return code === "passphrase-short"
    ? "settings.passphraseShort"
    : "settings.passphraseFailed";
}
