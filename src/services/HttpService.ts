import { RETRY_ATTEMPTS, RETRY_BASE_DELAY_MS } from "../constants";
import { proxyFailure } from "../proxy/failures";
import { ProviderError, type ProviderId } from "../types";
import { consumeSseStream, consumeNdjsonStream } from "./sse";
import { logger } from "./LoggerService";
import { abortableSleep, abortError, requestSignal } from "./abort";

export interface HttpRequest {
  url: string;
  method?: "GET" | "POST";
  headers: Record<string, string>;
  body?: unknown;
  timeout: number;
  provider: ProviderId;
  signal?: AbortSignal;
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error && proxyFailure(error.message)) return false;
  const status = error instanceof ProviderError ? error.status : undefined;
  return status === undefined || status === 429 || status >= 500;
}

export async function httpRequest<T>(req: HttpRequest): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    if (req.signal?.aborted) throw abortError();
    const request = requestSignal(req.timeout, req.signal);
    try {
      const response = await fetch(req.url, {
        method: req.method ?? "GET",
        headers: req.headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: request.signal,
      });
      if (req.signal?.aborted) throw abortError();
      if (request.timedOut())
        throw new ProviderError(req.provider, "TIMEOUT", "Request timeout");
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new ProviderError(
          req.provider,
          `HTTP_${response.status}`,
          `Request failed with status ${response.status}: ${text.slice(0, 300)}`,
          response.status
        );
      }
      const result = (await response.json()) as T;
      if (req.signal?.aborted) throw abortError();
      if (request.timedOut())
        throw new ProviderError(req.provider, "TIMEOUT", "Request timeout");
      return result;
    } catch (error) {
      if (req.signal?.aborted) throw abortError();
      lastError = request.timedOut()
        ? new ProviderError(req.provider, "TIMEOUT", "Request timeout")
        : error;
      if (attempt < RETRY_ATTEMPTS && isRetryableError(lastError)) {
        const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
        logger.warn(
          "http",
          `Attempt ${attempt} failed, retrying in ${delay}ms`,
          {
            status:
              lastError instanceof ProviderError ? lastError.status : undefined,
            error:
              lastError instanceof Error
                ? lastError.message
                : String(lastError),
          }
        );
        request.dispose();
        await abortableSleep(delay, req.signal);
        continue;
      }
      break;
    } finally {
      request.dispose();
    }
  }
  if (lastError instanceof ProviderError) throw lastError;
  if (lastError instanceof Error)
    throw new ProviderError(req.provider, "NETWORK_ERROR", lastError.message);
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
  format: "sse" | "ndjson";
  onPayload: (payload: string) => void | "stop";
  signal?: AbortSignal;
}

export function parseStreamPayload<T>(
  payload: string,
  provider: ProviderId
): T {
  let parsed: T;
  try {
    parsed = JSON.parse(payload) as T;
  } catch {
    throw new ProviderError(
      provider,
      "STREAM_PROTOCOL_ERROR",
      "Invalid stream payload"
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProviderError(
      provider,
      "STREAM_PROTOCOL_ERROR",
      "Invalid stream payload"
    );
  }
  const error = (parsed as { error?: { message?: string } | string } | null)
    ?.error;
  if (error)
    throw new ProviderError(
      provider,
      "STREAM_ERROR",
      typeof error === "string"
        ? error
        : (error.message ?? "Provider stream failed")
    );
  return parsed;
}

export async function httpStream(req: StreamRequest): Promise<void> {
  if (req.signal?.aborted) throw abortError();
  const request = requestSignal(req.timeout, req.signal);
  try {
    const response = await fetch(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: request.signal,
    });
    if (req.signal?.aborted) throw abortError();
    if (request.timedOut())
      throw new ProviderError(req.provider, "TIMEOUT", "Stream timeout");
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new ProviderError(
        req.provider,
        `HTTP_${response.status}`,
        `Stream request failed with status ${response.status}: ${text.slice(0, 300)}`,
        response.status
      );
    }
    const source = {
      body: response.body,
      onFrame: (payload: string) => {
        if (req.signal?.aborted) throw abortError();
        if (request.timedOut())
          throw new ProviderError(req.provider, "TIMEOUT", "Stream timeout");
        if (payload === "[DONE]") return "stop";
        return req.onPayload(payload);
      },
    };
    if (req.format === "ndjson") await consumeNdjsonStream(source);
    else await consumeSseStream(source);
    if (req.signal?.aborted) throw abortError();
    if (request.timedOut())
      throw new ProviderError(req.provider, "TIMEOUT", "Stream timeout");
  } catch (error) {
    if (req.signal?.aborted) throw abortError();
    if (request.timedOut())
      throw new ProviderError(req.provider, "TIMEOUT", "Stream timeout");
    throw error;
  } finally {
    request.dispose();
  }
}
