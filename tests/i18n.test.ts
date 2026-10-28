import { describe, expect, it } from "vitest";
import en from "../src/i18n/locales/en.json";
import pt from "../src/i18n/locales/pt.json";
import es from "../src/i18n/locales/es.json";
import fr from "../src/i18n/locales/fr.json";
import de from "../src/i18n/locales/de.json";

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
});
