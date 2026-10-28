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
];

export function sanitizeText(text: string): string {
  return SECRET_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, "***REDACTED***"),
    text
  );
}

function sanitizeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (typeof value === "string") {
      result[key] = sanitizeText(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = sanitizeMeta(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
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
    scope,
    message: sanitizeText(message),
    meta: meta ? sanitizeMeta(meta) : undefined,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  const line = `[${entry.timestamp}] [${level.toUpperCase()}] [${scope}] ${message}`;
  if (level === "error") {
    console.error(line, meta ?? "");
  } else if (level === "warn") {
    console.warn(line, meta ?? "");
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
