export type FriendlyErrorKind =
  | "noApiKey"
  | "noModel"
  | "errors.ollamaOffline"
  | "errors.ollamaWebBlocked"
  | "errors.network"
  | "errors.timeout"
  | "errors.rateLimited"
  | "errors.auth"
  | "errors.generic";

function isOllamaEndpoint(message: string): boolean {
  return message.includes("11434") || /ollama/i.test(message);
}

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
