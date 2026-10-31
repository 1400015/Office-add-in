import { describe, expect, it, beforeEach, vi } from "vitest";
import { logger, sanitizeText } from "../src/services/LoggerService";

describe("sanitizeText", () => {
  it("redacts OpenAI-style keys (sk-...)", () => {
    expect(sanitizeText("key: sk-abc123def456ghi789")).toBe(
      "key: ***REDACTED***"
    );
  });

  it("redacts Bearer tokens", () => {
    expect(sanitizeText("Authorization: Bearer eyJhbGciOi.abc123xyz")).toBe(
      "Authorization: ***REDACTED***"
    );
  });

  it("redacts x-api-key headers", () => {
    expect(sanitizeText("x-api-key: my-super-secret-key-12345")).toBe(
      "***REDACTED***"
    );
  });

  it("redacts Google API keys (AIza...)", () => {
    expect(sanitizeText("using AIzaSyA1234567890abcdefghij")).toBe(
      "using ***REDACTED***"
    );
  });

  it("redacts key=value assignments with long values", () => {
    expect(sanitizeText("api key=abcdefghijklmnopqrst1234")).toBe(
      "api ***REDACTED***"
    );
  });

  it("leaves ordinary text untouched", () => {
    expect(sanitizeText("chat request for model mistral-large")).toBe(
      "chat request for model mistral-large"
    );
  });

  it("handles multiple secrets in one string", () => {
    const result = sanitizeText(
      "sk-firstsecret123 and Bearer tokentokentoken12"
    );
    expect(result).toBe("***REDACTED*** and ***REDACTED***");
  });
});

describe("logger sanitization", () => {
  beforeEach(() => {
    logger.clear();
  });

  it("sanitizes message content", () => {
    logger.info("test", "request with sk-abcdef123456 in message");
    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.message).not.toContain("sk-abcdef123456");
    expect(entries[0]!.message).toContain("***REDACTED***");
  });

  it("redacts secrets in console output, nested arrays and sensitive keys", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const circular: Record<string, unknown> = { apiKey: "short-secret" };
    circular.self = circular;
    logger.warn("test", "request https://example.test/?key=shortsecret", {
      entries: [{ authorization: "custom-secret" }, ["Bearer tokentokentoken"]],
      circular,
    });
    const output = JSON.stringify(consoleSpy.mock.calls);
    expect(output).not.toContain("shortsecret");
    expect(output).not.toContain("short-secret");
    expect(output).not.toContain("custom-secret");
    expect(output).not.toContain("tokentokentoken");
    consoleSpy.mockRestore();
  });

  it("sanitizes string meta values", () => {
    logger.warn("test", "auth failed", {
      header: "Bearer abcdefghijklmnop",
      status: 401,
    });
    const entries = logger.getEntries();
    expect(entries[0]!.meta?.header).toBe("***REDACTED***");
    expect(entries[0]!.meta?.status).toBe(401);
  });

  it("sanitizes nested meta objects", () => {
    logger.info("test", "nested", {
      request: {
        auth: "x-api-key: supersecretkey123456789",
      },
    });
    const entries = logger.getEntries();
    const request = entries[0]!.meta?.request as Record<string, unknown>;
    expect(request.auth).toBe("***REDACTED***");
  });

  it("preserves non-string meta values", () => {
    logger.info("test", "stats", { count: 5, ok: true, list: [1, 2, 3] });
    const entries = logger.getEntries();
    expect(entries[0]!.meta).toEqual({ count: 5, ok: true, list: [1, 2, 3] });
  });
});
