/**
 * The vocabulary of failures the proxy answers with.
 *
 * The worker uses these strings to reply, and the taskpane uses them to
 * recognise a proxy failure — mapping it to a translated message and
 * skipping retries that cannot change the outcome — so they live in one
 * place and can never drift apart.
 */
export const PROXY_FAILURE_MESSAGES = {
  config:
    "Proxy misconfiguration: ALLOWED_ORIGINS must be configured in production",
  origin: "Origin not allowed",
  upstream: "Upstream not allowed",
} as const;

export type ProxyFailureKind = keyof typeof PROXY_FAILURE_MESSAGES;

/**
 * Recognises a proxy failure inside a larger message (the HTTP layer prefixes
 * responses with the status line). Returns null for anything else.
 */
export function proxyFailure(message: string): ProxyFailureKind | null {
  const kinds = Object.keys(PROXY_FAILURE_MESSAGES) as ProxyFailureKind[];
  for (const kind of kinds) {
    if (message.includes(PROXY_FAILURE_MESSAGES[kind])) return kind;
  }
  return null;
}
