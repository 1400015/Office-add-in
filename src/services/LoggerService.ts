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
    message,
    meta,
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
