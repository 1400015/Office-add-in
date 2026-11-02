import type { AIModel, ProviderId } from "../types";
import { PROVIDER_DEFINITIONS } from "../config/providers";

export interface CatalogModelMetadata {
  capabilities?: unknown;
  architecture?: unknown;
  supportedGenerationMethods?: unknown;
}

type Compatibility = "supported" | "unknown" | "unsupported";

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Prefer explicit provider capabilities; names only identify known families. */
export function chatCompatibility(
  provider: ProviderId,
  id: string,
  metadata: CatalogModelMetadata
): Compatibility {
  const capabilities = record(metadata.capabilities);
  if (typeof capabilities?.completion_chat === "boolean") {
    return capabilities.completion_chat ? "supported" : "unsupported";
  }
  if (provider === "ollama" && Array.isArray(metadata.capabilities)) {
    return metadata.capabilities.includes("completion")
      ? "supported"
      : "unsupported";
  }
  if (provider === "gemini") {
    if (/(?:embed|imagen|(?:^|-)image(?:-|$)|veo)/i.test(id)) {
      return "unsupported";
    }
    return Array.isArray(metadata.supportedGenerationMethods) &&
      metadata.supportedGenerationMethods.includes("generateContent")
      ? "supported"
      : "unsupported";
  }
  const architecture = record(metadata.architecture);
  if (Array.isArray(architecture?.output_modalities)) {
    const textOutput = architecture.output_modalities.includes("text");
    const textInput =
      !Array.isArray(architecture.input_modalities) ||
      architecture.input_modalities.includes("text");
    return textOutput && textInput ? "supported" : "unsupported";
  }
  if (typeof architecture?.modality === "string") {
    const [input, output] = architecture.modality.split("->");
    if (output) {
      return input?.split("+").includes("text") &&
        output.split("+").includes("text")
        ? "supported"
        : "unsupported";
    }
  }

  // These task-specific models cannot serve the text chat requests we send.
  const name = id.toLowerCase();
  if (
    /(?:embed|rerank|moderation|whisper|transcrib|\btts\b|realtime|gpt-image|dall-e|image-generation)/.test(
      name
    )
  ) {
    return "unsupported";
  }
  if (provider === "openai") {
    // Pro and Codex endpoints use the Responses API, which this adapter does not.
    if (
      /(?:^|[-:])(?:audio|codex)(?:[-:]|$)/.test(name) ||
      /^(?:gpt-\d+(?:\.\d+)?|o\d+)-pro(?:-|$)/.test(name) ||
      /^(?:computer-use|text-|davinci|babbage|curie|ada)/.test(name)
    )
      return "unsupported";
    if (/^(?:ft:)?(?:gpt-\d|chatgpt-|o\d+(?:[-:]|$))/.test(name)) {
      return "supported";
    }
  }
  if (provider === "claude" && /^claude-/.test(name)) return "supported";
  // Retain custom and future models, but require an explicit user selection.
  return "unknown";
}

export function defaultChatModel(
  models: AIModel[],
  provider: ProviderId
): string {
  const supported = models.filter(
    (model) => model.chatCompatibility === "supported"
  );
  return (
    PROVIDER_DEFINITIONS[provider].defaultModels.find((id) =>
      supported.some((model) => model.id === id)
    ) ??
    supported[0]?.id ??
    ""
  );
}
