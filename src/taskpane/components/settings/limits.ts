import type { ProviderId } from "../../../types";
import { MAX_TOKENS_LIMIT } from "../../../config/reasoningProfiles";
import { modelParams } from "../../../config/modelParams";

/**
 * Slider bound shown for the max-tokens field: the global cap or the
 * model family's own limit, whichever is lower.
 */
export function effectiveMaxTokensLimit(
  model: string,
  provider: ProviderId
): number {
  return Math.min(
    MAX_TOKENS_LIMIT,
    modelParams(model || "default", provider).maxTokensLimit
  );
}
