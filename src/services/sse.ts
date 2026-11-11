/** Wire framing only. A callback returning "stop" ends consumption. */
export interface SseStreamSource {
  body: ReadableStream<Uint8Array>;
  onFrame: (payload: string) => unknown;
}

async function consumeLines(
  body: ReadableStream<Uint8Array>,
  onLine: (line: string) => boolean,
  flushLast: boolean
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let stopped = false;
  let completed = false;
  try {
    while (!stopped) {
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (onLine(line.endsWith("\r") ? line.slice(0, -1) : line)) {
          stopped = true;
          break;
        }
      }
    }
    if (completed && flushLast) {
      buffer += decoder.decode();
      if (buffer) onLine(buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer);
    }
  } finally {
    if (!completed) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function consumeSseStream({
  body,
  onFrame,
}: SseStreamSource): Promise<void> {
  let data: string[] = [];
  await consumeLines(
    body,
    (line) => {
      if (!line) {
        if (!data.length) return false;
        const payload = data.join("\n");
        data = [];
        return onFrame(payload) === "stop";
      }
      if (line.startsWith(":")) return false;
      const colon = line.indexOf(":");
      const name = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (name === "data") data.push(value);
      return false;
    },
    false
  );
}

export async function consumeNdjsonStream({
  body,
  onFrame,
}: SseStreamSource): Promise<void> {
  await consumeLines(
    body,
    (line) => {
      if (!line.trim()) return false;
      return onFrame(line) === "stop";
    },
    true
  );
}
