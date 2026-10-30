import type { ThemeMode } from "../../../types";

/** Theme choices shown in the general settings dropdown, in UI order. */
export const THEME_OPTIONS: ThemeMode[] = ["light", "dark", "auto"];

/** UI languages offered in the general settings dropdown, in UI order. */
export const LANGUAGE_OPTIONS = ["en", "pt", "es", "fr", "de"] as const;
export type LanguageOption = (typeof LANGUAGE_OPTIONS)[number];
