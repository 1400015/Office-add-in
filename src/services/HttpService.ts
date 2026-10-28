import { RETRY_ATTEMPTS, RETRY_BASE_DELAY_MS } from "../constants";
import { ProviderError, type ProviderId } from "../types";
import { logger } from "./LoggerService";

export interface HttpRequest {
  url: string;
  method?: "GET" | "POST";
  headers: Record<string, string>;
  body?: unknown;
  timeout: number;
  provider: ProviderId;
  signal?: AbortSignal;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status?: number): boolean {
  if (status === undefined) return true;
  return status === 429 || status >= 500;
}

export async function httpRequest<T>(req: HttpRequest): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), req.timeout);
    const combinedSignal = req.signal
      ? AbortSignal.any([controller.signal, req.signal])
      : controller.signal;

    try {
      const response = await fetch(req.url, {
        method: req.method ?? "GET",
        headers: req.headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: combinedSignal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new ProviderError(
          req.provider,
          `HTTP_${response.status}`,
          `Request failed with status ${response.status}: ${text.slice(0, 300)}`,
          response.status
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      clearTimeout(timeoutId);

      const status = error instanceof ProviderError ? error.status : undefined;
      const retryable = isRetryable(status);

      if (attempt < RETRY_ATTEMPTS && retryable) {
        const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
        logger.warn(
          "http",
          `Attempt ${attempt} failed, retrying in ${delay}ms`,
          {
            url: req.url,
            status,
            error: error instanceof Error ? error.message : String(error),
          }
        );
        await sleep(delay);
        continue;
      }

      break;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (lastError instanceof ProviderError) {
    throw lastError;
  }
  if (lastError instanceof Error) {
    throw new ProviderError(req.provider, "NETWORK_ERROR", lastError.message);
  }
  throw new ProviderError(
    req.provider,
    "UNKNOWN_ERROR",
    "Unknown request failure"
  );
}

export interface StreamRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeout: number;
  provider: ProviderId;
  onToken: (chunk: string) => void;
  signal?: AbortSignal;
}

export async function httpStream(req: StreamRequest): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), req.timeout);
  const combinedSignal = req.signal
    ? AbortSignal.any([controller.signal, req.signal])
    : controller.signal;

  try {
    const response = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: combinedSignal,
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new ProviderError(
        req.provider,
        `HTTP_${response.status}`,
        `Stream request failed with status ${response.status}: ${text.slice(0, 300)}`,
        response.status
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
            error?: { message?: string };
          };
          if (parsed.error?.message) {
            throw new ProviderError(
              req.provider,
              "STREAM_ERROR",
              parsed.error.message
            );
          }
          const chunk = parsed.choices?.[0]?.delta?.content;
          if (chunk) req.onToken(chunk);
        } catch (error) {
          if (error instanceof ProviderError) throw error;
        }
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
