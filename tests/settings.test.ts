import { describe, expect, it, vi } from "vitest";
import { effectiveMaxTokensLimit } from "../src/taskpane/components/settings/limits";
import {
  runConnectionTest,
  type I18nLabel,
} from "../src/taskpane/components/settings/connection";
import {
  passphraseErrorKey,
  submitPassphrase,
} from "../src/taskpane/components/settings/passphrase";
import {
  LANGUAGE_OPTIONS,
  THEME_OPTIONS,
} from "../src/taskpane/components/settings/options";
import type { ProviderConfig } from "../src/types";

describe("effectiveMaxTokensLimit", () => {
  it("caps the slider at the global limit for unlimited families", () => {
    // Ollama has no family limit (Infinity) -> global cap applies.
    expect(effectiveMaxTokensLimit("anything", "ollama")).toBe(128000);
    expect(effectiveMaxTokensLimit("", "ollama")).toBe(128000);
  });

  it("uses the model family limit when it is below the global cap", () => {
    expect(effectiveMaxTokensLimit("gpt-4o", "openai")).toBe(32768);
    expect(effectiveMaxTokensLimit("gemini-2", "gemini")).toBe(8192);
    expect(effectiveMaxTokensLimit("gemini-3", "gemini")).toBe(65536);
  });

  it("allows the global cap for reasoning models and newer families", () => {
    expect(effectiveMaxTokensLimit("gpt-5", "openai")).toBe(128000);
    expect(effectiveMaxTokensLimit("claude-sonnet-5-5", "claude")).toBe(128000);
  });

  it("treats an unknown model like the provider default", () => {
    expect(effectiveMaxTokensLimit("not-a-model", "openai")).toBe(
      effectiveMaxTokensLimit("", "openai")
    );
  });
});

describe("runConnectionTest", () => {
  const config = { id: "openai" } as ProviderConfig;
  const t: I18nLabel = (key, options) =>
    options && "count" in options ? `${key}:${String(options.count)}` : key;

  it("runs a real probe and reports the model count", async () => {
    const probe = vi.fn(async () => ({ modelCount: 3 }));
    const result = await runConnectionTest(probe, config, t);
    expect(probe).toHaveBeenCalledWith(config, undefined);
    expect(result).toEqual({
      ok: true,
      message: "settings.connectionOk:3",
    });
  });

  it("maps provider failures without exposing raw messages", async () => {
    const listModels = vi.fn(async () => {
      throw new Error("boom");
    });
    const result = await runConnectionTest(listModels, config, (key) => key);
    expect(result).toEqual({ ok: false, message: "errors.generic" });
  });

  it("maps non-Error rejections", async () => {
    const listModels = vi.fn(async () => {
      throw "plain";
    });
    const result = await runConnectionTest(listModels, config, (key) => key);
    expect(result).toEqual({ ok: false, message: "errors.generic" });
  });
});

describe("submitPassphrase", () => {
  const depsCreating = {
    passphraseEnabled: false,
    create: vi.fn(async () => undefined),
    unlock: vi.fn(async () => true),
  };

  it("creates the vault on first use and clears the field", async () => {
    const create = vi.fn(async () => undefined);
    const unlock = vi.fn(async () => true);
    const outcome = await submitPassphrase("secret", {
      passphraseEnabled: false,
      create,
      unlock,
    });
    expect(create).toHaveBeenCalledWith("secret");
    expect(unlock).not.toHaveBeenCalled();
    expect(outcome).toEqual({ clearInput: true, errorKey: null });
  });

  it("unlocks and clears the field on the right passphrase", async () => {
    const create = vi.fn(async () => undefined);
    const unlock = vi.fn(async () => true);
    const outcome = await submitPassphrase("secret", {
      passphraseEnabled: true,
      create,
      unlock,
    });
    expect(unlock).toHaveBeenCalledWith("secret");
    expect(create).not.toHaveBeenCalled();
    expect(outcome).toEqual({ clearInput: true, errorKey: null });
  });

  it("keeps the field and reports the wrong-passphrase key", async () => {
    const outcome = await submitPassphrase("secret", {
      passphraseEnabled: true,
      create: vi.fn(async () => undefined),
      unlock: vi.fn(async () => false),
    });
    expect(outcome).toEqual({
      clearInput: false,
      errorKey: "settings.passphraseWrong",
    });
  });

  it("propagates store errors for the caller to map", async () => {
    await expect(
      submitPassphrase("ab", {
        passphraseEnabled: false,
        create: vi.fn(async () => {
          throw new Error("passphrase-short");
        }),
        unlock: vi.fn(async () => true),
      })
    ).rejects.toThrow("passphrase-short");
    expect(depsCreating).toBeDefined();
  });
});

describe("passphraseErrorKey", () => {
  it("maps the short-passphrase code to its key", () => {
    expect(passphraseErrorKey("passphrase-short")).toBe(
      "settings.passphraseShort"
    );
  });

  it("falls back to the generic failure key", () => {
    expect(passphraseErrorKey("")).toBe("settings.passphraseFailed");
    expect(passphraseErrorKey("unexpected")).toBe("settings.passphraseFailed");
  });
});

describe("general settings options", () => {
  it("offers every theme mode", () => {
    expect(THEME_OPTIONS).toEqual(["light", "dark", "auto"]);
  });

  it("offers the five UI languages in order", () => {
    expect([...LANGUAGE_OPTIONS]).toEqual(["en", "pt", "es", "fr", "de"]);
  });
});
