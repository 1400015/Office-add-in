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

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
}

export async function handleProxy(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders(),
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
      headers: corsHeaders(),
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
  for (const [key, value] of Object.entries(corsHeaders())) out.set(key, value);
  return new Response(response.body, { status: response.status, headers: out });
}
