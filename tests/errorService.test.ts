import { describe, expect, it } from "vitest";
import { friendlyError } from "../src/services/ErrorService";

describe("friendlyError", () => {
  it("passes through known sentinel errors", () => {
    expect(friendlyError(new Error("noApiKey"))).toBe("noApiKey");
    expect(friendlyError(new Error("noModel"))).toBe("noModel");
  });

  it("maps Ollama connection failures to actionable guidance", () => {
    const error = new Error(
      "ProviderError: NETWORK_ERROR: TypeError: failed to fetch http://localhost:11434"
    );
    expect(friendlyError(error, { provider: "ollama" })).toBe(
      "errors.ollamaOffline"
    );
  });

  it("maps Ollama failure on the web to the web-blocked message", () => {
    const error = new Error("NETWORK_ERROR: failed to fetch");
    expect(friendlyError(error, { provider: "ollama", onWeb: true })).toBe(
      "errors.ollamaWebBlocked"
    );
  });

  it("detects Ollama endpoints even without provider context", () => {
    const error = new Error("Request failed: connection refused on 11434");
    expect(friendlyError(error)).toBe("errors.ollamaOffline");
  });

  it("maps timeout errors", () => {
    expect(friendlyError(new Error("The operation was aborted"))).toBe(
      "errors.timeout"
    );
  });

  it("maps authentication errors", () => {
    expect(friendlyError(new Error("HTTP_401: unauthorized"))).toBe(
      "errors.auth"
    );
  });

  it("maps rate limiting", () => {
    expect(friendlyError(new Error("HTTP_429: rate limit exceeded"))).toBe(
      "errors.rateLimited"
    );
  });

  it("maps generic network errors for non-Ollama providers", () => {
    expect(
      friendlyError(new Error("NETWORK_ERROR: failed to fetch"), {
        provider: "mistral",
      })
    ).toBe("errors.network");
  });

  it("maps host messages the user can act on", () => {
    expect(friendlyError(new Error("Select some text first."))).toBe(
      "errors.noSelection"
    );
    expect(
      friendlyError(new Error("Select a cell containing a formula."))
    ).toBe("errors.noFormula");
    expect(
      friendlyError(new Error("The AI did not return a valid JSON array."))
    ).toBe("errors.badAiFormat");
  });

  it("explains the proxy's own failures instead of a generic message", () => {
    expect(
      friendlyError(
        new Error(
          "Request failed with status 500: Proxy misconfiguration: ALLOWED_ORIGINS must be configured in production"
        ),
        { provider: "mistral" }
      )
    ).toBe("errors.proxyConfig");
    expect(
      friendlyError(
        new Error("Request failed with status 403: Origin not allowed"),
        { provider: "openai" }
      )
    ).toBe("errors.proxyOrigin");
    expect(
      friendlyError(
        new Error("Request failed with status 400: Upstream not allowed"),
        { provider: "openai" }
      )
    ).toBe("errors.proxyUpstream");
  });

  it("falls back to generic", () => {
    expect(friendlyError(new Error("some unexpected thing"))).toBe(
      "errors.generic"
    );
    expect(friendlyError("not an error object")).toBe("errors.generic");
  });
});
