import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import pt from "./locales/pt.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";

export const resources = {
  en: { translation: en },
  pt: { translation: pt },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
} as const;

export const SUPPORTED_LANGUAGES = ["en", "pt", "es", "fr", "de"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function toSupported(
  value: string | null | undefined
): SupportedLanguage | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(lower)) {
    return lower as SupportedLanguage;
  }
  const primary = lower.split(/[-_]/)[0] ?? "";
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(primary)
    ? (primary as SupportedLanguage)
    : null;
}

/**
 * First-run language: the browser/Office UI language when it is one of the
 * supported ones, English otherwise. A language saved in Settings overrides
 * this as soon as the store hydrates (see useAppStore.hydrate).
 */
export function detectLanguage(): SupportedLanguage {
  if (typeof navigator === "undefined") return "en";
  const candidates = [navigator.language, ...(navigator.languages ?? [])];
  for (const candidate of candidates) {
    const supported = toSupported(candidate);
    if (supported) return supported;
  }
  return "en";
}

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
