/**
 * Shared text/event-stream reader used by the providers' streaming chat.
 *
 * It owns the wire-format part only: reading the body, decoding UTF-8 in
 * stream mode (so a multi-byte character split across chunks survives),
 * splitting complete lines, and handing over each `data:` frame payload.
 * Payload interpretation stays with the caller, because every provider
 * speaks a slightly different JSON dialect.
 */

export interface SseStreamSource {
  /** Streamed response body, for example `Response#body`. */
  body: ReadableStream<Uint8Array>;
  /** Called once per complete `data:` frame, payload trimmed. Sentinel and incomplete frames never reach it:
   * - `[DONE]` frames are filtered out here (OpenAI-style stream terminator);
   * - a `data:` line is only complete once the batch containing its terminating newline arrives;
   * - lines without the `data:` prefix (SSE comments, blank lines) are ignored. */
  onFrame: (payload: string) => void;
}

export async function consumeSseStream({
  body,
  onFrame,
}: SseStreamSource): Promise<void> {
  const reader = body.getReader();
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
      onFrame(payload);
    }
  }
}
