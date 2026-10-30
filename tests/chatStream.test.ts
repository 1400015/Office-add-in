import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeSseStream } from "../src/services/sse";
import { httpStream, type StreamRequest } from "../src/services/HttpService";
import { ClaudeProvider } from "../src/providers/ClaudeProvider";
import { OpenAIProvider } from "../src/providers/OpenAIProvider";
import { createDefaultProviderConfig } from "../src/config/providers";
import type { ChatMessage, ChatOptions } from "../src/types";

function makeMessages(): ChatMessage[] {
  return [{ id: "1", role: "user", content: "Hello", timestamp: Date.now() }];
}

function makeOptions(): ChatOptions {
  return {
    model: "test-model",
    temperature: 0.2,
    maxTokens: 1024,
    reasoning: "off",
  };
}

const encoder = new TextEncoder();

/** Builds a body stream whose chunks can split lines (even UTF-8) apart. */
function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function sseResponse(status: number, ...chunks: Uint8Array[]): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: streamFromChunks(chunks),
    text: () => Promise.resolve(""),
  } as unknown as Response;
}

function makeStreamRequest(
  onToken: (chunk: string) => void,
  overrides: Partial<StreamRequest> = {}
): StreamRequest {
  return {
    url: "https://example.invalid/stream",
    headers: {},
    body: {},
    timeout: 5000,
    provider: "openai",
    onToken,
    ...overrides,
  } as StreamRequest;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("consumeSseStream", () => {
  it("reassembles a data frame split across two chunks", async () => {
    const frames: string[] = [];
    const first =
      'data: {"choices":[{"delta":{"cont';
    const second = 'ent":"Olá"}}]}\n\n';

    await consumeSseStream({
      body: streamFromChunks([
        encoder.encode(first),
        encoder.encode(second),
      ]),
      onFrame: (payload) => frames.push(payload),
    });

    expect(frames).toEqual(['{"choices":[{"delta":{"content":"Olá"}}]}']);
  });

  it("decodes a multi-byte character split across chunks", async () => {
    const fullText =
      'data: {"choices":[{"delta":{"content":"explicação"}}]}\n\n';
    const bytes = encoder.encode(fullText);
    // Split between the two bytes of "ç" (0xC3 0xA7) to force streaming decode.
    let split = bytes.length;
    for (let i = 0; i < bytes.length - 1; i += 1) {
      if (bytes[i] === 0xc3 && bytes[i + 1] === 0xa7) split = i + 1;
    }
    expect(split).toBeLessThan(bytes.length);

    const frames: string[] = [];
    await consumeSseStream({
      body: streamFromChunks([bytes.slice(0, split), bytes.slice(split)]),
      onFrame: (payload) => frames.push(payload),
    });

    const parsed = JSON.parse(frames[0] ?? "") as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    expect(parsed.choices?.[0]?.delta?.content).toBe("explicação");
  });

  it("skips frames the wire format excludes", async () => {
    const frames: string[] = [];
    const chunks = [
      ": keep-alive comment\n",
      "\n",
      'data: [DONE]\n',
      'data: {"choices":[]}\n\n',
    ].map((s) => encoder.encode(s));

    await consumeSseStream({
      body: streamFromChunks(chunks),
      onFrame: (payload) => frames.push(payload),
    });

    expect(frames).toEqual(["{\"choices\":[]}"]);
  });

  it("drops an unterminated final event (missing newline), per the SSE spec", async () => {
    const frames: string[] = [];
    await consumeSseStream({
      body: streamFromChunks([encoder.encode('data: {"done:true"}')]),
      onFrame: (payload) => frames.push(payload),
    });
    expect(frames).toEqual([]);
  });

  it("rejects when the stream fails mid-way", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"ok":true}\n\n'));
        setTimeout(() => controller.error(new Error("network drop")), 5);
      },
    });

    await expect(
      consumeSseStream({ body: stream, onFrame: () => {} })
    ).rejects.toThrow("network drop");
  });

  it("rejects when the caller aborts mid-stream", async () => {
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller.signal.addEventListener(
          "abort",
          () => streamController.error(new Error("aborted")),
          { once: true }
        );
      },
    });

    const pending = consumeSseStream({ body: stream, onFrame: () => {} });
    controller.abort();

    await expect(pending).rejects.toThrow("aborted");
  });
});

describe("httpStream (OpenAI-style mapping)", () => {
  it("assembles streamed deltas and stops at [DONE]", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"# Tít"}}]}\n',
      'data: {"choices":[{"delta":{"content":"ulo"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":""}}]}\n',
      'data: [DONE]\n\n',
    ].map((s) => encoder.encode(s));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(200, ...chunks)));

    const tokens: string[] = [];
    await httpStream(makeStreamRequest((chunk) => tokens.push(chunk)));

    expect(tokens.join("")).toBe("# Título");
  });

  it("surfaces an error frame as a ProviderError", async () => {
    const chunks = ['data: {"error":{"message":"quota excedida"}}\n\n'].map((s) =>
      encoder.encode(s)
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(200, ...chunks)));

    await expect(
      httpStream(makeStreamRequest(() => {}))
    ).rejects.toMatchObject({
      provider: "openai",
      code: "STREAM_ERROR",
      message: "quota excedida",
    });
  });

  it("aborting during the stream rejects the request", async () => {
    const abortController = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn((_: string, init?: { signal?: AbortSignal }) => {
        const stream = new ReadableStream<Uint8Array>({
          start(streamController) {
            init?.signal?.addEventListener(
              "abort",
              () => streamController.error(new Error("aborted")),
              { once: true }
            );
          },
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
          text: () => Promise.resolve(""),
        } as unknown as Response);
      })
    );

    const pending = httpStream(
      makeStreamRequest(() => {}, { signal: abortController.signal })
    );
    abortController.abort();

    await expect(pending).rejects.toThrow("aborted");
  });
});

describe("ClaudeProvider streaming", () => {
  function claudeProvider(): ClaudeProvider {
    return new ClaudeProvider({
      ...createDefaultProviderConfig("claude"),
      apiKey: "test-key",
    } as ConstructorParameters<typeof ClaudeProvider>[0]);
  }

  it("emits tokens from content_block_delta and skips other frame types", async () => {
    const chunks = [
      'data: {"type":"message_start"}\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Olá"}}\n\n',
      'data: not-json-at-all\n', // malformed, must be skipped
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" mundo"}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ].map((s) => encoder.encode(s));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(200, ...chunks)));

    const tokens: string[] = [];
    await claudeProvider().chatStream(makeMessages(), makeOptions(), (chunk) =>
      tokens.push(chunk)
    );

    expect(tokens).toEqual(["Olá", " mundo"]);
  });

  it("rejects on an error frame", async () => {
    const chunks = ['data: {"error":{"message":"overloaded"}}\n\n'].map((s) =>
      encoder.encode(s)
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(200, ...chunks)));

    await expect(
      claudeProvider().chatStream(makeMessages(), makeOptions(), () => {})
    ).rejects.toMatchObject({
      provider: "claude",
      code: "STREAM_ERROR",
      message: "overloaded",
    });
  });
});

describe("OpenAI provider through the shared stream", () => {
  it("accumulates markdown tokens incrementally", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"# Tít"}}]}\n',
      'data: {"choices":[{"delta":{"content":"ulo"}}]}\n',
      'data: {"choices":[{"delta":{"content":"\\n\\n- ponto 1"}}]}\n\n',
      'data: [DONE]\n\n',
    ].map((s) => encoder.encode(s));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(200, ...chunks)));

    const tokens: string[] = [];
    const provider = new OpenAIProvider({
      ...createDefaultProviderConfig("openai"),
      apiKey: "test-key",
    } as ConstructorParameters<typeof OpenAIProvider>[0]);
    await provider.chatStream(makeMessages(), makeOptions(), (chunk) =>
      tokens.push(chunk)
    );

    expect(tokens.join("")).toBe("# Título\n\n- ponto 1");
  });
});
