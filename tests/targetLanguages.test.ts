import { describe, expect, it } from "vitest";
import en from "../src/i18n/locales/en.json";
import pt from "../src/i18n/locales/pt.json";
import es from "../src/i18n/locales/es.json";
import fr from "../src/i18n/locales/fr.json";
import de from "../src/i18n/locales/de.json";
import {
  TARGET_LANGUAGES,
  isTargetLanguage,
} from "../src/taskpane/components/QuickActions";

const bundles: Record<string, { languages?: Record<string, string> }> = {
  en: en as { languages?: Record<string, string> },
  pt: pt as { languages?: Record<string, string> },
  es: es as { languages?: Record<string, string> },
  fr: fr as { languages?: Record<string, string> },
  de: de as { languages?: Record<string, string> },
};

describe("translate target languages", () => {
  it("accepts exactly the codes offered by the dropdown", () => {
    for (const code of TARGET_LANGUAGES) {
      expect(isTargetLanguage(code)).toBe(true);
    }
    expect(isTargetLanguage("zh")).toBe(false);
    expect(isTargetLanguage("pt-BR")).toBe(false);
    expect(isTargetLanguage("")).toBe(false);
    expect(isTargetLanguage(undefined)).toBe(false);
  });

  it("has a non-empty languages label for every code in every bundle", () => {
    for (const [locale, bundle] of Object.entries(bundles)) {
      const languages = bundle.languages;
      expect(languages, `locale ${locale} has no languages section`).toBeTruthy();
      for (const code of TARGET_LANGUAGES) {
        expect(
          languages?.[code],
          `${locale}.languages.${code}`
        ).toBeTruthy();
      }
    }
  });
});
