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

  it("falls back to generic", () => {
    expect(friendlyError(new Error("some unexpected thing"))).toBe(
      "errors.generic"
    );
    expect(friendlyError("not an error object")).toBe("errors.generic");
  });
});
