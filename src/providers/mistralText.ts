import { ProviderError } from "../types";

/** Mistral can interleave visible text with thinking and other content blocks. */
export function normalizeMistralText(content: unknown): string {
  if (content === undefined || content === null) return "";
  if (typeof content === "string") return content;
  const invalidContent = (): never => {
    throw new ProviderError(
      "mistral",
      "INVALID_RESPONSE",
      "Mistral returned invalid text content"
    );
  };
  if (!Array.isArray(content)) return invalidContent();

  let text = "";
  for (const block of content) {
    if (typeof block !== "object" || block === null || Array.isArray(block))
      return invalidContent();
    const chunk = block as Record<string, unknown>;
    if (typeof chunk.type !== "string" || !chunk.type.trim())
      return invalidContent();
    if (chunk.type === "text") {
      if (typeof chunk.text !== "string") return invalidContent();
      text += chunk.text;
    }
  }
  return text;
}
