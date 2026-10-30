export interface SlidePlan {
  title: string;
  bullets: string[];
}

export function contentLanguageName(code: string): string {
  const base = code.toLowerCase().split("-")[0] ?? "en";
  switch (base) {
    case "pt":
      return "Portuguese";
    case "es":
      return "Spanish";
    case "fr":
      return "French";
    case "de":
      return "German";
    default:
      return "English";
  }
}

/** Ribbon and quick-action translate have no language picker, so the target is the other of English and Portuguese. */
export function defaultTranslateLanguageCode(uiLanguage: string): "en" | "pt" {
  return uiLanguage.toLowerCase().startsWith("en") ? "pt" : "en";
}

export function clampSlideCount(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.min(15, Math.max(1, Math.round(value)));
}

export function extractJsonPayload(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? raw).trim();
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start === -1 || end <= start) {
    throw new Error("The AI did not return a valid JSON array.");
  }
  return body.slice(start, end + 1);
}

export function parseSlidePlans(
  raw: string,
  expectedCount?: number
): SlidePlan[] {
  const parsed: unknown = JSON.parse(extractJsonPayload(raw));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("The AI did not return a valid presentation plan.");
  }
  const plans = parsed.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error("The AI did not return a valid presentation plan.");
    }
    const record = item as { title?: unknown; bullets?: unknown };
    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (!title) {
      throw new Error(`Slide ${index + 1} is missing a title.`);
    }
    const bullets = Array.isArray(record.bullets)
      ? record.bullets
          .filter((bullet): bullet is string => typeof bullet === "string")
          .map((bullet) => bullet.trim())
          .filter(Boolean)
      : [];
    return { title, bullets: bullets.length > 0 ? bullets : [title] };
  });
  if (expectedCount && plans.length > expectedCount) {
    return plans.slice(0, expectedCount);
  }
  return plans;
}

export function parseAlignedStrings(
  raw: string,
  originals: string[]
): string[] {
  if (originals.length === 0) {
    throw new Error("The active slide has no text.");
  }
  try {
    const parsed: unknown = JSON.parse(extractJsonPayload(raw));
    if (
      Array.isArray(parsed) &&
      parsed.length === originals.length &&
      parsed.every((item) => typeof item === "string")
    ) {
      return (parsed as string[]).map((value, index) => {
        const text = value.trim();
        return text || originals[index]!;
      });
    }
  } catch (error) {
    const jsonProblem =
      error instanceof SyntaxError ||
      (error instanceof Error && /JSON array/i.test(error.message));
    if (!jsonProblem) throw error;
  }
  if (originals.length === 1) {
    const plain = raw.replace(/```(?:json)?/gi, "").trim();
    if (plain) return [plain];
  }
  throw new Error("The AI did not return one text block per shape.");
}
