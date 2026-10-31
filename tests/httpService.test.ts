import { afterEach, describe, expect, it, vi } from "vitest";
import { httpRequest, isRetryableError } from "../src/services/HttpService";
import { ProviderError } from "../src/types";

function providerError(message: string, status?: number): ProviderError {
  return new ProviderError("mistral", `HTTP_${status ?? "0"}`, message, status);
}

describe("isRetryableError", () => {
  it("does not retry the proxy's own failures", () => {
    expect(
      isRetryableError(
        providerError(
          "Request failed with status 500: Proxy misconfiguration: ALLOWED_ORIGINS must be configured in production",
          500
        )
      )
    ).toBe(false);
    expect(
      isRetryableError(
        providerError(
          "Stream request failed with status 403: Origin not allowed",
          403
        )
      )
    ).toBe(false);
    expect(
      isRetryableError(
        providerError(
          "Request failed with status 400: Upstream not allowed",
          400
        )
      )
    ).toBe(false);
  });

  it("keeps retrying everything that could succeed later", () => {
    expect(
      isRetryableError(
        providerError("Request failed with status 500: upstream hiccup", 500)
      )
    ).toBe(true);
    expect(
      isRetryableError(
        providerError("Request failed with status 429: slow down", 429)
      )
    ).toBe(true);
    expect(
      isRetryableError(providerError("NETWORK_ERROR: failed to fetch"))
    ).toBe(true);
    expect(
      isRetryableError(
        providerError("Request failed with status 400: bad body", 400)
      )
    ).toBe(false);
  });
});

describe("httpRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("surfaces a proxy misconfiguration on the first attempt", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          "Proxy misconfiguration: ALLOWED_ORIGINS must be configured in production",
          { status: 500 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      httpRequest({
        url: "https://proxy.example/chat/completions",
        method: "POST",
        headers: { "X-OUAI-Upstream": "https://api.mistral.ai" },
        timeout: 5000,
        provider: "mistral",
      })
    ).rejects.toMatchObject({ status: 500 });

    // The configuration cannot fix itself: no backoff, one attempt only.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels the retry delay without starting another request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => new Response("busy", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = httpRequest({
      url: "https://example.invalid",
      headers: {},
      timeout: 5000,
      provider: "openai",
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not return a response when the caller cancels during JSON decoding", async () => {
    const controller = new AbortController();
    let resolveJson!: (value: unknown) => void;
    const started = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: () =>
          new Promise((resolve) => {
            resolveJson = resolve;
            started();
          }),
      }))
    );
    const pending = httpRequest({
      url: "https://example.invalid",
      headers: {},
      timeout: 5000,
      provider: "openai",
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
    controller.abort();
    resolveJson({ valid: true });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
