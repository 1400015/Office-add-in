import { describe, expect, it, vi, beforeEach } from "vitest";
import { MistralProvider } from "../src/providers/MistralProvider";
import { OpenAIProvider } from "../src/providers/OpenAIProvider";
import { OllamaProvider } from "../src/providers/OllamaProvider";
import { getReasoningStrategy } from "../src/config/reasoningProfiles";
import { createDefaultProviderConfig } from "../src/config/providers";
import { ConfigurationError, ProviderError } from "../src/types";
import type { ChatMessage, ChatOptions } from "../src/types";

function makeMessages(): ChatMessage[] {
  return [{ id: "1", role: "user", content: "Hello", timestamp: Date.now() }];
}

function makeOptions(overrides: Partial<ChatOptions> = {}): ChatOptions {
  return {
    model: "test-model",
    temperature: 0.2,
    maxTokens: 1024,
    reasoning: "off",
    ...overrides,
  };
}

function mockFetchOnce(payload: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  });
}

describe("reasoning profiles", () => {
  it("returns empty suffix for off", () => {
    expect(getReasoningStrategy("off").systemPromptSuffix).toBe("");
  });

  it("returns increasing depth prompts", () => {
    const low = getReasoningStrategy("low").systemPromptSuffix;
    const max = getReasoningStrategy("maximum").systemPromptSuffix;
    expect(low.length).toBeGreaterThan(0);
    expect(max.length).toBeGreaterThan(low.length);
  });
});

describe("MistralProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends chat request and extracts content", async () => {
    const fetchMock = mockFetchOnce({
      choices: [{ message: { content: "Bonjour!" } }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const config = {
      ...createDefaultProviderConfig("mistral"),
      apiKey: "test-key",
    };
    const provider = new MistralProvider(config);
    const result = await provider.chat(makeMessages(), makeOptions());

    expect(result).toBe("Bonjour!");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://api.mistral.ai/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key"
    );
  });

  it("throws ConfigurationError without API key", async () => {
    const provider = new MistralProvider(
      createDefaultProviderConfig("mistral")
    );
    await expect(
      provider.chat(makeMessages(), makeOptions())
    ).rejects.toBeInstanceOf(ConfigurationError);
  });

  it("injects reasoning suffix into system message", async () => {
    const fetchMock = mockFetchOnce({
      choices: [{ message: { content: "ok" } }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const config = {
      ...createDefaultProviderConfig("mistral"),
      apiKey: "k",
    };
    const provider = new MistralProvider(config);
    await provider.chat(
      makeMessages(),
      makeOptions({ reasoning: "high", systemPrompt: "Be brief." })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0]!.role).toBe("system");
    expect(body.messages[0]!.content).toContain("Be brief.");
    expect(body.messages[0]!.content.length).toBeGreaterThan(
      "Be brief.".length
    );
  });

  it("retries on 429 and eventually succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve("rate limited"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: "after retry" } }],
          }),
        text: () => Promise.resolve(""),
      });
    vi.stubGlobal("fetch", fetchMock);

    const config = {
      ...createDefaultProviderConfig("mistral"),
      apiKey: "k",
    };
    const provider = new MistralProvider(config);
    const result = await provider.chat(makeMessages(), makeOptions());
    expect(result).toBe("after retry");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws ProviderError on non-retryable 400", async () => {
    const fetchMock = mockFetchOnce({ error: { message: "bad request" } }, 400);
    vi.stubGlobal("fetch", fetchMock);

    const config = {
      ...createDefaultProviderConfig("mistral"),
      apiKey: "k",
    };
    const provider = new MistralProvider(config);
    await expect(
      provider.chat(makeMessages(), makeOptions())
    ).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("OpenAIProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses proxy URL when useProxy is enabled", async () => {
    const fetchMock = mockFetchOnce({
      choices: [{ message: { content: "hi" } }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const config = {
      ...createDefaultProviderConfig("openai"),
      apiKey: "sk-test",
      useProxy: true,
      proxyUrl: "https://proxy.example.com/openai",
    };
    const provider = new OpenAIProvider(config);
    await provider.chat(makeMessages(), makeOptions());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://proxy.example.com/openai/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-OUAI-Upstream"]).toBe("https://api.openai.com/v1");
  });

  it("omits temperature and uses max_completion_tokens for reasoning models", async () => {
    const fetchMock = mockFetchOnce({
      choices: [{ message: { content: "ok" } }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const config = {
      ...createDefaultProviderConfig("openai"),
      apiKey: "sk-test",
    };
    const provider = new OpenAIProvider(config);
    await provider.chat(
      makeMessages(),
      makeOptions({ model: "o3-mini", maxTokens: 5000 })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.temperature).toBeUndefined();
    expect(body.max_completion_tokens).toBe(5000);
    expect(body.max_tokens).toBeUndefined();
  });

  it("clamps the output budget to the model family limit", async () => {
    const fetchMock = mockFetchOnce({
      choices: [{ message: { content: "ok" } }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const config = {
      ...createDefaultProviderConfig("openai"),
      apiKey: "sk-test",
    };
    const provider = new OpenAIProvider(config);
    await provider.chat(
      makeMessages(),
      makeOptions({ model: "gpt-4o", maxTokens: 500000 })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.max_completion_tokens).toBe(32768);
    expect(body.temperature).toBe(0.2);
  });
});

describe("OllamaProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("works without an API key and targets /api/chat", async () => {
    const fetchMock = mockFetchOnce({
      message: { role: "assistant", content: "local reply" },
      done: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OllamaProvider(createDefaultProviderConfig("ollama"));
    const result = await provider.chat(makeMessages(), makeOptions());

    expect(result).toBe("local reply");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/api/chat");
    expect(
      (init.headers as Record<string, string>).Authorization
    ).toBeUndefined();
  });

  it("falls back to default models when listing fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connection refused"))
    );
    const provider = new OllamaProvider(createDefaultProviderConfig("ollama"));
    const models = await provider.getModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]!.provider).toBe("ollama");
  });
});
