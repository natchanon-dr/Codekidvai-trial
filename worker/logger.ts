export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  ts: string;
  level: LogLevel;
  event?: string;
  worker_id?: string;
  run_id?: string;
  dataset_id?: string;
  attempt?: number;
  step?: string;
  transition?: string;
  duration_ms?: number;
  count?: number;
  message?: string;
  [key: string]: unknown;
}

function log(level: LogLevel, entry: Omit<LogEntry, "ts" | "level">): void {
  const line: LogEntry = { ts: new Date().toISOString(), level, ...entry };
  process.stdout.write(JSON.stringify(line) + "\n");
}

export const logger = {
  info: (entry: Omit<LogEntry, "ts" | "level">) => log("info", entry),
  warn: (entry: Omit<LogEntry, "ts" | "level">) => log("warn", entry),
  error: (entry: Omit<LogEntry, "ts" | "level">) => log("error", entry),
  debug: (entry: Omit<LogEntry, "ts" | "level">) => log("debug", entry),
};

export type Logger = typeof logger;
