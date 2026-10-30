/** Codes offered by the translate dialog, in UI order. */
export const TARGET_LANGUAGES = ["pt", "en", "es", "fr", "de"] as const;

/** Codes offered by the translate dialog, in UI order. */
export type TargetLanguage = (typeof TARGET_LANGUAGES)[number];

/** Fluent UI dropdowns report the option as a possibly-undefined string. */
export function isTargetLanguage(
  value: string | undefined
): value is TargetLanguage {
  return (
    typeof value === "string" &&
    (TARGET_LANGUAGES as readonly string[]).includes(value)
  );
}
