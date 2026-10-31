import { proxyFailure, type ProxyFailureKind } from "../proxy/failures";

export type FriendlyErrorKind =
  | "noApiKey"
  | "noModel"
  | "errors.ollamaOffline"
  | "errors.ollamaWebBlocked"
  | "errors.proxyConfig"
  | "errors.proxyOrigin"
  | "errors.proxyUpstream"
  | "errors.network"
  | "errors.timeout"
  | "errors.rateLimited"
  | "errors.auth"
  | "errors.editConflict"
  | "errors.selectionTooLong"
  | "errors.emptyResponse"
  | "errors.locked"
  | "errors.notReady"
  | "errors.generic";

const PROXY_ERROR_KEYS: Record<ProxyFailureKind, FriendlyErrorKind> = {
  config: "errors.proxyConfig",
  origin: "errors.proxyOrigin",
  upstream: "errors.proxyUpstream",
};

function isOllamaEndpoint(message: string): boolean {
  return message.includes("11434") || /ollama/i.test(message);
}

const HOST_ERRORS: Record<string, string> = {
  "No text available to summarize.": "errors.noText",
  "Select some text first.": "errors.noSelection",
  "Select a cell containing a formula.": "errors.noFormula",
  "Select a range with data.": "errors.noRange",
  "Select a range with text.": "errors.noRange",
  "The active slide has no text.": "errors.noSlideText",
  "The presentation has no slides.": "errors.noSlides",
  "The presentation has no text.": "errors.noSlideText",
  "A topic is required.": "errors.topicRequired",
  "The AI did not return a formula.": "errors.badAiFormat",
  "selection-too-long": "errors.selectionTooLong",
  "empty-response": "errors.emptyResponse",
  "action-conflict": "errors.editConflict",
  locked: "errors.locked",
  notReady: "errors.notReady",
};

export function friendlyError(
  error: unknown,
  context?: { provider?: string; onWeb?: boolean }
): FriendlyErrorKind | string {
  const cause = (error as { cause?: unknown } | null)?.cause;
  const raw =
    error instanceof Error ? `${error.message} ${cause ?? ""}` : String(error);
  const message = raw.trim();

  if (message === "noApiKey") return "noApiKey";
  if (message === "noModel") return "noModel";

  const hostKey = HOST_ERRORS[message];
  if (hostKey) return hostKey;
  if (
    /did not return a valid|missing a title|one text block per shape/i.test(
      message
    )
  ) {
    return "errors.badAiFormat";
  }

  // The proxy answers with stable strings of its own, so its failures can be
  // explained instead of collapsing into a generic message.
  const proxyKind = proxyFailure(message);
  if (proxyKind) return PROXY_ERROR_KEYS[proxyKind];

  const status = (error as { status?: number } | null)?.status;
  const code = (error as { code?: string } | null)?.code;
  if (status === 401 || status === 403) return "errors.auth";
  if (status === 429) return "errors.rateLimited";
  if (code === "EMPTY_RESPONSE") return "errors.emptyResponse";

  const provider = context?.provider;
  const isOllama = provider === "ollama" || isOllamaEndpoint(message);

  if (isOllama) {
    if (context?.onWeb) return "errors.ollamaWebBlocked";
    if (
      /failed to fetch|network|connection refused|ECONNREFUSED|fetch/i.test(
        message
      )
    ) {
      return "errors.ollamaOffline";
    }
  }

  if (/abort|timeout/i.test(message)) return "errors.timeout";
  if (/HTTP_401|HTTP_403|invalid api key|unauthorized/i.test(message)) {
    return "errors.auth";
  }
  if (/HTTP_429|rate limit/i.test(message)) return "errors.rateLimited";
  if (/failed to fetch|network_error/i.test(message)) return "errors.network";

  return "errors.generic";
}
