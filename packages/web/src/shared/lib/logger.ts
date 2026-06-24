/**
 * Structured logger with security sanitization.
 *
 * Features:
 * - Log levels: debug, info, warn, error
 * - Structured context fields (runtime, scope, userId, etc.)
 * - Automatic sensitive data redaction
 * - In-memory ring buffer for debug UI
 * - Transport abstraction (console, future: remote)
 *
 * Scope taxonomy:
 * - `app` — startup, global lifecycle
 * - `api` — HTTP middleware
 * - `realtime` — event loop, queue, reconnect
 * - `connection-health` — online/offline, degraded
 * - `action` — user actions (`logAction`)
 * - `store:<name>` — Zustand mutations (`logStoreAction`)
 * - `trace:messages` | `trace:chat-list` | `trace:sidebar-unread` | `trace:folders` | `trace:link-preview` — pipeline traces
 * - `perf` — timers and web vitals
 * - `console` — captured raw console output
 *
 * Usage:
 *   import { logger, createLogger } from "~/lib/logger";
 *
 *   logger.info("User logged in", { userId: 42 });
 *   logger.error("API failed", { status: 401, url: "/api/v1/messages" });
 *
 *   const apiLog = createLogger("api");
 *   apiLog.warn("Slow response", { ms: 3200, endpoint: "/messages" });
 *
 *   subscribeLogHistory(() => refreshLogsUi());
 *   logAction("instance_switched", { instanceId: "…" });
 *   logApiCall("GET", "/messages", { status: 200, params: { anchor: "newest" } });
 *
 * Dev-only console capture: initConsoleCapture() in installDevTools().
 * Pipeline traces: `__dev__.setPipelineTrace("chat-list")` + `__dev__.setLogLevel("debug")`.
 */

import { safeCatch } from "./guards";
import { getRuntime } from "./pwa";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  scope: string;
  message: string;
  timestamp: string;
  runtime: string;
  data?: Record<string, unknown>;
}

export interface LogTransport {
  write(entry: LogEntry): void;
}

// ---------------------------------------------------------------------------
// Sensitive data redaction
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = new Set([
  "apikey",
  "api_key",
  "apiKey",
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "auth",
  "cookie",
  "session",
  "sessionid",
  "csrf",
  "csrftoken",
  "creditcard",
  "ssn",
  "private_key",
  "privateKey",
]);

const SENSITIVE_PATTERNS = [/^[A-Za-z0-9+/=]{20,}$/, /^Basic\s+/i, /^Bearer\s+/i];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[-_]/g, ""));
}

function isSensitiveValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return SENSITIVE_PATTERNS.some((p) => p.test(value));
}

export function redact(data: unknown, depth = 0): unknown {
  if (depth > 8) return "[max depth]";

  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    return isSensitiveValue(data) ? "[REDACTED]" : data;
  }

  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map((item) => redact(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redact(value, depth + 1);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Ring buffer (in-memory log history)
// ---------------------------------------------------------------------------

const MAX_BUFFER_SIZE = 500;
const ringBuffer: LogEntry[] = [];
const historyListeners = new Set<() => void>();

function notifyLogHistoryListeners(): void {
  for (const listener of historyListeners) {
    safeCatch(listener, "log history subscriber")();
  }
}

function pushToBuffer(entry: LogEntry): void {
  ringBuffer.push(entry);
  if (ringBuffer.length > MAX_BUFFER_SIZE) {
    ringBuffer.shift();
  }
  notifyLogHistoryListeners();
}

export function getLogHistory(): readonly LogEntry[] {
  return ringBuffer;
}

export function clearLogHistory(): void {
  ringBuffer.length = 0;
  notifyLogHistoryListeners();
}

/** Subscribe to ring-buffer changes (new entry or clear). Returns unsubscribe. */
export function subscribeLogHistory(listener: () => void): () => void {
  historyListeners.add(listener);
  return () => {
    historyListeners.delete(listener);
  };
}

/**
 * Append to the in-memory ring buffer without transports (e.g. console capture).
 * Always recorded regardless of min log level.
 */
export function appendBufferedLog(
  level: LogLevel,
  scope: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  const entry: LogEntry = {
    level,
    scope,
    message,
    timestamp: new Date().toISOString(),
    runtime: typeof window !== "undefined" ? getRuntime() : "node",
    ...(data && { data: redact(data) as Record<string, unknown> }),
  };
  pushToBuffer(entry);
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let minLevel: LogLevel = import.meta.env?.DEV ? "info" : "warn";

export function setMinLevel(level: LogLevel): void {
  minLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
}

const consoleTransport: LogTransport = {
  write(entry) {
    const prefix = `[${entry.scope}]`;
    const payload = entry.data ?? "";

    if (entry.level === "error") {
      console.error(prefix, entry.message, payload);
      return;
    }
    if (entry.level === "warn") {
      console.warn(prefix, entry.message, payload);
      return;
    }
    if (!import.meta.env?.DEV) {
      return;
    }
    // In dev, mirror info/debug to the console (still buffered for __dev__.logs()).
    if (entry.level === "info") {
      // eslint-disable-next-line no-console -- dev-only; production keeps info off console
      console.info(prefix, entry.message, payload);
    } else if (entry.level === "debug") {
      // eslint-disable-next-line no-console -- dev-only trace
      console.debug(prefix, entry.message, payload);
    }
  },
};

const electronFileTransport: LogTransport = {
  write(entry) {
    if (typeof window === "undefined") return;
    const append = window.electronAPI?.logs?.append;
    if (!append) return;

    // Fire-and-forget append: logging must never block UI code.
    void append(JSON.stringify(entry)).catch(() => {});
  },
};

const transports: LogTransport[] = [consoleTransport, electronFileTransport];

export function addTransport(transport: LogTransport): void {
  transports.push(transport);
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

export function createLogger(scope: string): Logger {
  function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      scope,
      message,
      timestamp: new Date().toISOString(),
      runtime: typeof window !== "undefined" ? getRuntime() : "node",
      ...(data && { data: redact(data) as Record<string, unknown> }),
    };

    pushToBuffer(entry);
    for (const transport of transports) {
      try {
        transport.write(entry);
      } catch {
        /* transport failure must not crash the app */
      }
    }
  }

  return {
    debug: (msg, data) => log("debug", msg, data),
    info: (msg, data) => log("info", msg, data),
    warn: (msg, data) => log("warn", msg, data),
    error: (msg, data) => log("error", msg, data),
    child: (childScope) => createLogger(`${scope}:${childScope}`),
  };
}

export const logger = createLogger("app");

// ---------------------------------------------------------------------------
// Helpers for common patterns
// ---------------------------------------------------------------------------

export function logAction(action: string, data?: Record<string, unknown>): void {
  createLogger("action").info(action, data);
}

export function logApiCall(
  method: string,
  path: string,
  options?: {
    status?: number;
    durationMs?: number;
    error?: string;
    aborted?: boolean;
    params?: Record<string, unknown>;
  },
): void {
  const apiLog = createLogger("api");
  const data: Record<string, unknown> = { method, path };
  if (options?.status != null) data.status = options.status;
  if (options?.durationMs != null) data.durationMs = options.durationMs;
  if (options?.params != null && Object.keys(options.params).length > 0) {
    data.params = options.params;
  }

  if (options?.aborted) {
    data.aborted = true;
    apiLog.debug(`${method} ${path} aborted`, data);
    return;
  }

  if (options?.error) {
    data.error = options.error;
    apiLog.error(`${method} ${path} failed`, data);
  } else if (options?.durationMs && options.durationMs > 3000) {
    apiLog.warn(`${method} ${path} slow`, data);
  } else {
    apiLog.debug(`${method} ${path}`, data);
  }
}

export { isAbortError } from "./abort-error";

export function logEvent(type: string, data?: Record<string, unknown>): void {
  createLogger("realtime").debug(`event: ${type}`, data);
}

export function logStoreAction(
  store: string,
  action: string,
  data?: Record<string, unknown>,
): void {
  createLogger(`store:${store}`).debug(action, data);
}
