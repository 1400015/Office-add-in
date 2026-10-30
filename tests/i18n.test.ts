import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../src/i18n/locales/en.json";
import pt from "../src/i18n/locales/pt.json";
import es from "../src/i18n/locales/es.json";
import fr from "../src/i18n/locales/fr.json";
import de from "../src/i18n/locales/de.json";
import {
  PROMPT_TEMPLATES,
  templateText,
  type Localized,
} from "../src/taskpane/PromptTemplates";
import { detectLanguage } from "../src/i18n";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function flatten(value: Json, prefix = ""): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { [prefix]: String(value) };
  }
  const flat: Record<string, string> = {};
  for (const [key, child] of Object.entries(value)) {
    Object.assign(flat, flatten(child as Json, prefix ? `${prefix}.${key}` : key));
  }
  return flat;
}

const reference = flatten(en as unknown as Json);
const locales = { pt, es, fr, de } as const;

const hasOwn = (obj: Record<string, string>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function hasPath(value: Json, dotted: string): boolean {
  let current: Json = value;
  for (const part of dotted.split(".")) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return false;
    }
    if (!Object.prototype.hasOwnProperty.call(current, part)) {
      return false;
    }
    current = (current as Record<string, Json>)[part] ?? null;
  }
  return current !== null && typeof current === "object" && !Array.isArray(current);
}

describe("translations", () => {
  for (const [code, locale] of Object.entries(locales)) {
    it(`${code} has exactly the English keys`, () => {
      expect(Object.keys(flatten(locale as unknown as Json)).sort()).toEqual(
        Object.keys(reference).sort()
      );
    });

    it(`${code} has no empty strings`, () => {
      for (const [key, value] of Object.entries(
        flatten(locale as unknown as Json)
      )) {
        expect(value.trim(), `${code}:${key}`).not.toBe("");
      }
    });
  }

  it("keeps the interpolation placeholder in every locale", () => {
    for (const locale of Object.values(locales)) {
      expect(flatten(locale as unknown as Json)["chat.contextAttached"]).toContain(
        "{{type}}"
      );
    }
  });

  it("uses only translation keys that exist in the English bundle", () => {
    const used = new Set<string>();
    const dynamic = new Set<string>();
    const srcDir = fileURLToPath(new URL("../src", import.meta.url));
    for (const file of sourceFiles(srcDir)) {
      const code = readFileSync(file, "utf8");
      for (const match of code.matchAll(/\bt\(\s*(['"`])([A-Za-z0-9_.]+)\1/g)) {
        const key = match[2];
        if (key) used.add(key);
      }
      for (const match of code.matchAll(/\bt\(\s*`([A-Za-z0-9_.]+)\.\$\{/g)) {
        const prefix = match[1];
        if (prefix) dynamic.add(prefix);
      }
    }
    expect(used.size).toBeGreaterThan(50);
    for (const key of used) {
      // Plural keys are resolved via the _one/_other suffixes by i18next.
      const found =
        hasOwn(reference, key) ||
        hasOwn(reference, `${key}_one`) ||
        hasOwn(reference, `${key}_other`);
      expect(found, `missing translation key: ${key}`).toBe(true);
    }
    expect(dynamic.size).toBeGreaterThan(0);
    for (const prefix of dynamic) {
      expect(hasPath(en as unknown as Json, prefix), `bad prefix: ${prefix}`).toBe(
        true
      );
    }
  });

  it("keeps values identical to English on an explicit allowlist", () => {
    const allowlist: Record<string, string[]> = {
      pt: ["app.chat", "templates.categories.marketing"],
      es: ["app.chat", "settings.general", "templates.categories.marketing"],
      fr: ["app.chat", "chat.contextTypes.document", "templates.categories.marketing"],
      de: ["app.chat", "settings.unlockPassphrase", "templates.categories.marketing"],
    };
    for (const [code, locale] of Object.entries(locales)) {
      const flat = flatten(locale as unknown as Json);
      const identical = Object.keys(flat)
        .filter((key) => hasOwn(reference, key) && flat[key] === reference[key])
        .sort();
      expect(identical, `${code} untranslated values`).toEqual(
        (allowlist[code] ?? []).slice().sort()
      );
    }
  });
});

describe("prompt templates", () => {
  it("has all five languages filled in every field", () => {
    const languages = ["en", "pt", "es", "fr", "de"] as const;
    for (const template of PROMPT_TEMPLATES) {
      const fields: Localized[] = [template.title, template.prompt];
      if (template.systemPrompt) fields.push(template.systemPrompt);
      for (const field of fields) {
        for (const language of languages) {
          expect(
            field[language].trim(),
            `${template.id}:${language}`
          ).not.toBe("");
        }
      }
    }
  });

  it("templateText selects the language and falls back to English", () => {
    const value: Localized = { en: "en", pt: "pt", es: "es", fr: "fr", de: "de" };
    expect(templateText(value, "pt-BR")).toBe("pt");
    expect(templateText(value, "ES")).toBe("es");
    expect(templateText(value, "fr")).toBe("fr");
    expect(templateText(value, "de-AT")).toBe("de");
    expect(templateText(value, "en")).toBe("en");
    expect(templateText(value, "ja")).toBe("en");
  });
});

describe("language detection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the browser language when it is supported", () => {
    vi.stubGlobal("navigator", { language: "pt-PT" });
    expect(detectLanguage()).toBe("pt");
    vi.stubGlobal("navigator", { language: "es-419" });
    expect(detectLanguage()).toBe("es");
    vi.stubGlobal("navigator", { language: "de-AT" });
    expect(detectLanguage()).toBe("de");
  });

  it("falls back to English for unsupported languages", () => {
    vi.stubGlobal("navigator", { language: "zh-CN" });
    expect(detectLanguage()).toBe("en");
  });

  it("falls back to English when there is no navigator", () => {
    vi.stubGlobal("navigator", undefined);
    expect(detectLanguage()).toBe("en");
  });
});
