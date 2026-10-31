import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeSseStream, consumeNdjsonStream } from "../src/services/sse";
import { OpenAIProvider } from "../src/providers/OpenAIProvider";
import { MistralProvider } from "../src/providers/MistralProvider";
import { OpenRouterProvider } from "../src/providers/OpenRouterProvider";
import { GeminiProvider } from "../src/providers/GeminiProvider";
import { ClaudeProvider } from "../src/providers/ClaudeProvider";
import { OllamaProvider } from "../src/providers/OllamaProvider";
import { createDefaultProviderConfig } from "../src/config/providers";
import type { ChatMessage, ChatOptions, ProviderId } from "../src/types";

const encoder = new TextEncoder();
const messages: ChatMessage[] = [
  { id: "1", role: "user", content: "Hi", timestamp: 1 },
];
const options: ChatOptions = {
  model: "m",
  temperature: 0.2,
  maxTokens: 1024,
  reasoning: "off",
};
function chunks(text: string): Uint8Array[] {
  const bytes = encoder.encode(text);
  return Array.from(bytes, (byte) => new Uint8Array([byte]));
}
function stream(parts: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      parts.forEach((part) => c.enqueue(part));
      c.close();
    },
  });
}
function respond(text: string): void {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response(stream(chunks(text)), { status: 200 }))
  );
}
function provider(id: ProviderId) {
  const config = { ...createDefaultProviderConfig(id), apiKey: "fake-key" };
  switch (id) {
    case "openai":
      return new OpenAIProvider(config);
    case "mistral":
      return new MistralProvider(config);
    case "openrouter":
      return new OpenRouterProvider(config);
    case "claude":
      return new ClaudeProvider(config);
    case "gemini":
      return new GeminiProvider(config);
    case "ollama":
      return new OllamaProvider(config);
  }
}
afterEach(() => vi.unstubAllGlobals());

describe("stream framing", () => {
  it("decodes UTF-8 split into bytes and joins multiline SSE events with CRLF", async () => {
    const frames: string[] = [];
    await consumeSseStream({
      body: stream(
        chunks(
          ": hi\r\nevent: message\r\ndata: Olá\r\ndata: mundo\r\n\r\ndata: ignored"
        )
      ),
      onFrame: (frame) => {
        frames.push(frame);
      },
    });
    expect(frames).toEqual(["Olá\nmundo"]);
  });
  it("delivers the last NDJSON record without a newline", async () => {
    const frames: string[] = [];
    await consumeNdjsonStream({
      body: stream(chunks('{"a":1}\n\n{"a":2}')),
      onFrame: (frame) => {
        frames.push(frame);
      },
    });
    expect(frames).toEqual(['{"a":1}', '{"a":2}']);
  });
  it("propagates a mid-stream network failure", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"ok":true}\n\n'));
        setTimeout(() => controller.error(new Error("network drop")), 5);
      },
    });
    await expect(consumeSseStream({ body, onFrame: () => {} })).rejects.toThrow(
      "network drop"
    );
  });
});

describe("provider streaming", () => {
  it.each(["openai", "mistral", "openrouter"] as const)(
    "maps %s deltas and terminates",
    async (id) => {
      respond(
        'data: {"choices":[{"delta":{"content":"Olá"}}]}\n\ndata: {"choices":[{"delta":{"content":"!"}}]}\n\ndata: [DONE]\n\ndata: {"choices":[{"delta":{"content":"wrong"}}]}\n\n'
      );
      const tokens: string[] = [];
      await provider(id).chatStream(messages, options, (token) =>
        tokens.push(token)
      );
      expect(tokens.join("")).toBe("Olá!");
    }
  );
  it("maps Gemini candidates and does not put its key in the URL", async () => {
    respond(
      'data: {"candidates":[{"content":{"parts":[{"text":"Olá"}]}}]}\n\n'
    );
    const tokens: string[] = [];
    await provider("gemini").chatStream(messages, options, (token) =>
      tokens.push(token)
    );
    expect(tokens).toEqual(["Olá"]);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).not.toContain("fake-key");
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "fake-key"
    );
  });
  it("maps Claude deltas without AbortSignal.any", async () => {
    const original = AbortSignal.any;
    Object.defineProperty(AbortSignal, "any", {
      value: undefined,
      configurable: true,
    });
    try {
      respond(
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Olá"}}\n\ndata: {"type":"message_stop"}\n\n'
      );
      const tokens: string[] = [];
      await provider("claude").chatStream(
        messages,
        options,
        (token) => tokens.push(token),
        undefined,
        new AbortController().signal
      );
      expect(tokens).toEqual(["Olá"]);
    } finally {
      Object.defineProperty(AbortSignal, "any", {
        value: original,
        configurable: true,
      });
    }
  });
  it("maps Ollama NDJSON including text in the terminal record", async () => {
    respond(
      '{"message":{"content":"Olá"},"done":false}\n{"message":{"content":"!"},"done":true}'
    );
    const tokens: string[] = [];
    await provider("ollama").chatStream(messages, options, (token) =>
      tokens.push(token)
    );
    expect(tokens.join("")).toBe("Olá!");
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse(String(init?.body)).options.temperature).toBe(0.2);
  });
  it("reports malformed frames and empty streams", async () => {
    respond("data: not-json\n\n");
    await expect(
      provider("openai").chatStream(messages, options, () => {})
    ).rejects.toMatchObject({ code: "STREAM_PROTOCOL_ERROR" });
    respond("data: [DONE]\n\n");
    await expect(
      provider("openai").chatStream(messages, options, () => {})
    ).rejects.toMatchObject({ code: "EMPTY_RESPONSE" });
  });
  it("surfaces provider error frames", async () => {
    respond('data: {"error":{"message":"quota exceeded"}}\n\n');
    await expect(
      provider("claude").chatStream(messages, options, () => {})
    ).rejects.toMatchObject({
      code: "STREAM_ERROR",
      message: "quota exceeded",
    });
  });
  it.each([401, 429, 500])(
    "does not retry failed stream HTTP %s",
    async (status) => {
      const fetchMock = vi.fn(async () => new Response("failure", { status }));
      vi.stubGlobal("fetch", fetchMock);
      await expect(
        provider("openai").chatStream(messages, options, () => {})
      ).rejects.toMatchObject({ status });
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  );
  it("honours an already aborted signal without fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider("openai").chatStream(
        messages,
        options,
        () => {},
        undefined,
        controller.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an enabled proxy with no URL instead of contacting the provider directly", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      ...createDefaultProviderConfig("openai"),
      apiKey: "fake",
      useProxy: true,
      proxyUrl: "",
    };
    const p = new OpenAIProvider(config);
    await expect(p.chatStream(messages, options, () => {})).rejects.toThrow(
      "Proxy URL is required"
    );
    await expect(p.chat(messages, options)).rejects.toThrow(
      "Proxy URL is required"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("aborts during streaming", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(c) {
                init.signal?.addEventListener("abort", () =>
                  c.error(new Error("aborted"))
                );
              },
            })
          )
        )
      )
    );
    const pending = provider("openai").chatStream(
      messages,
      options,
      () => {},
      undefined,
      controller.signal
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reports a stream timeout separately from caller cancellation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener(
              "abort",
              () => reject(new Error("aborted")),
              { once: true }
            );
          })
      )
    );
    const p = new OpenAIProvider({
      ...createDefaultProviderConfig("openai"),
      apiKey: "fake",
      timeout: 10,
    });
    await expect(
      p.chatStream(messages, options, () => {})
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("cancels an open reader when receiving a terminal event", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(
                  encoder.encode(
                    'data: {"choices":[{"delta":{"content":"x"}}]}\n\ndata: [DONE]\n\n'
                  )
                );
              },
              cancel,
            })
          )
      )
    );
    const tokens: string[] = [];
    await provider("openai").chatStream(messages, options, (token) =>
      tokens.push(token)
    );
    expect(tokens).toEqual(["x"]);
    expect(cancel).toHaveBeenCalledOnce();
  });
});
