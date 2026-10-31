type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
}

const MAX_ENTRIES = 500;
const entries: LogEntry[] = [];

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /Bearer\s+[A-Za-z0-9._~+/-]{8,}/gi,
  /x-api-key\s*[:=]\s*['"]?[A-Za-z0-9._~+/-]{8,}/gi,
  /AIza[A-Za-z0-9_-]{10,}/g,
  /gsk_[A-Za-z0-9]{20,}/g,
  /key\s*[:=]\s*['"]?[A-Za-z0-9._~+/-]{16,}/gi,
  /([?&](?:key|api[_-]?key|access[_-]?token|token|secret)=)[^&#\s]*/gi,
];

export function sanitizeText(text: string): string {
  return SECRET_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, "***REDACTED***"),
    text
  );
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return sanitizeText(value);
  if (value instanceof Error) return sanitizeText(value.message);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value))
    return value.map((item) => sanitizeValue(item, seen));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /^(?:api[_-]?key|authorization|x-api-key|x-goog-api-key|access[_-]?token|refresh[_-]?token|token|secret|password)$/i.test(
        key
      )
        ? "***REDACTED***"
        : sanitizeValue(item, seen),
    ])
  );
}

function sanitizeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(meta, new WeakSet()) as Record<string, unknown>;
}

function emit(
  level: LogLevel,
  scope: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    scope: sanitizeText(scope),
    message: sanitizeText(message),
    meta: meta ? sanitizeMeta(meta) : undefined,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  const line = `[${entry.timestamp}] [${level.toUpperCase()}] [${entry.scope}] ${entry.message}`;
  if (level === "error") {
    console.error(line, entry.meta ?? "");
  } else if (level === "warn") {
    console.warn(line, entry.meta ?? "");
  }
}

export const logger = {
  debug: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit("debug", scope, message, meta),
  info: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit("info", scope, message, meta),
  warn: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit("warn", scope, message, meta),
  error: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit("error", scope, message, meta),
  getEntries: (): LogEntry[] => [...entries],
  clear: (): void => {
    entries.length = 0;
  },
};
