const ALLOWED_HOSTS = new Set([
  "api.openai.com",
  "api.anthropic.com",
  "api.mistral.ai",
  "generativelanguage.googleapis.com",
  "openrouter.ai",
]);

const HOP_BY_HOP = new Set([
  "host",
  "content-length",
  "connection",
  "x-ouai-upstream",
]);

export interface ProxyEnv {
  /** Comma-separated list of origins allowed to call the proxy. */
  ALLOWED_ORIGINS?: string;
  /** Set to "production" to enable fail-fast configuration checks. */
  ENVIRONMENT?: string;
}

const DEFAULT_ALLOWED_ORIGINS = ["https://localhost:3000"];

export function isProduction(env?: ProxyEnv): boolean {
  return env?.ENVIRONMENT?.trim().toLowerCase() === "production";
}

export function hasConfiguredOrigins(env?: ProxyEnv): boolean {
  return Boolean(env?.ALLOWED_ORIGINS?.trim());
}

export function isAllowedUpstream(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(host)) return true;
  return host.endsWith(".openai.azure.com");
}

export function resolveUpstream(
  endpoint: string | null,
  pathAndQuery: string
): string | null {
  if (!endpoint || !isAllowedUpstream(endpoint)) return null;
  if (
    !pathAndQuery.startsWith("/") ||
    pathAndQuery.startsWith("//") ||
    pathAndQuery.includes("..")
  ) {
    return null;
  }
  return `${endpoint.replace(/\/$/, "")}${pathAndQuery}`;
}

export function allowedOrigins(env?: ProxyEnv): string[] {
  const raw = env?.ALLOWED_ORIGINS?.trim();
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isOriginAllowed(
  origin: string | null,
  env?: ProxyEnv
): boolean {
  // Requests without an Origin header (curl, server-to-server) cannot be
  // protected by CORS. In production they are refused; browsers always send
  // Origin on cross-origin fetches.
  if (!origin) return !isProduction(env);
  return allowedOrigins(env).includes(origin);
}

export function corsHeaders(
  origin: string | null = null
): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function handleProxy(
  request: Request,
  env?: ProxyEnv
): Promise<Response> {
  if (isProduction(env) && !hasConfiguredOrigins(env)) {
    return new Response(
      "Proxy misconfiguration: ALLOWED_ORIGINS must be configured in production",
      {
        status: 500,
        headers: corsHeaders(null),
      }
    );
  }

  const origin = request.headers.get("Origin");
  if (!isOriginAllowed(origin, env)) {
    return new Response("Origin not allowed", {
      status: 403,
      headers: corsHeaders(null),
    });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders(origin),
    });
  }

  const incoming = new URL(request.url);
  const target = resolveUpstream(
    request.headers.get("X-OUAI-Upstream"),
    `${incoming.pathname}${incoming.search}`
  );
  if (!target) {
    return new Response("Upstream not allowed", {
      status: 400,
      headers: corsHeaders(origin),
    });
  }

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });

  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" ? undefined : request.body,
  });
  const out = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    out.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers: out });
}
