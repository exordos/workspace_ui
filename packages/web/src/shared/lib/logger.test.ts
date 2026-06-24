/**
 * Tests for the structured logging module.
 *
 * The logger is the app's observability backbone. It provides credential
 * redaction, scoped log entries, level filtering, a ring buffer for
 * in-app debug UI, custom transports (e.g. Sentry), and helper functions
 * for API/event/store tracing. Broken redaction = leaked API keys in logs.
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  redact,
  createLogger,
  getLogHistory,
  clearLogHistory,
  setMinLevel,
  logApiCall,
  logAction,
  logEvent,
  logStoreAction,
  subscribeLogHistory,
  type LogEntry,
  type LogTransport,
  addTransport,
} from "./logger";

// redact() strips sensitive data from log payloads before they are stored or transmitted
describe("redact", () => {
  // Keys like apiKey, password, token must always be replaced with [REDACTED]
  it("redacts known sensitive keys", () => {
    const result = redact({
      username: "john",
      apiKey: "abc123secret",
      password: "hunter2",
      email: "john@example.com",
    }) as Record<string, unknown>;

    expect(result.username).toBe("john");
    expect(result.apiKey).toBe("[REDACTED]");
    expect(result.password).toBe("[REDACTED]");
    expect(result.email).toBe("john@example.com");
  });

  // Env headers may use ANY_CASE — redaction must be case-insensitive
  it("redacts case-insensitively", () => {
    const result = redact({
      API_KEY: "secret",
      Authorization: "Basic abc",
      TOKEN: "xyz",
    }) as Record<string, unknown>;

    expect(result.API_KEY).toBe("[REDACTED]");
    expect(result.Authorization).toBe("[REDACTED]");
    expect(result.TOKEN).toBe("[REDACTED]");
  });

  // "Basic ..." pattern indicates an auth header even under a non-standard key name
  it("redacts Basic auth values regardless of key name", () => {
    const result = redact({
      header: "Basic dXNlcjpwYXNz",
    }) as Record<string, unknown>;

    expect(result.header).toBe("[REDACTED]");
  });

  // "Bearer ..." pattern is used for JWT tokens — must be caught by value pattern
  it("redacts Bearer token values", () => {
    const result = redact({
      header: "Bearer eyJhbGciOiJIUzI1NiJ9",
    }) as Record<string, unknown>;

    expect(result.header).toBe("[REDACTED]");
  });

  // Normal data must pass through untouched — over-redaction hides useful debug info
  it("does not redact normal strings", () => {
    const result = redact({
      name: "John Doe",
      message: "Hello world",
      status: "active",
    }) as Record<string, unknown>;

    expect(result.name).toBe("John Doe");
    expect(result.message).toBe("Hello world");
    expect(result.status).toBe("active");
  });

  // Credentials can appear deep in nested objects — redaction must recurse
  it("handles nested objects", () => {
    const result = redact({
      user: {
        name: "John",
        credentials: {
          apiKey: "secret123",
          email: "j@example.com",
        },
      },
    }) as { user: { name: string; credentials: { apiKey: string; email: string } } };

    expect(result.user.name).toBe("John");
    expect(result.user.credentials.apiKey).toBe("[REDACTED]");
    expect(result.user.credentials.email).toBe("j@example.com");
  });

  // Arrays of objects (e.g. batch API responses) must also be redacted
  it("handles arrays", () => {
    const result = redact([{ apiKey: "secret" }, { name: "safe" }]) as Record<string, unknown>[];

    expect(result[0]?.apiKey).toBe("[REDACTED]");
    expect(result[1]?.name).toBe("safe");
  });

  // Null/undefined inputs should pass through without crashing
  it("handles null and undefined", () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });

  // Primitive values don't need redaction and should remain unchanged
  it("handles primitives", () => {
    expect(redact(42)).toBe(42);
    expect(redact(true)).toBe(true);
    expect(redact("hello")).toBe("hello");
  });

  // Deeply nested objects could cause stack overflow — depth limit prevents this
  it("limits recursion depth", () => {
    let obj: Record<string, unknown> = { value: "deep" };
    for (let i = 0; i < 15; i++) {
      obj = { nested: obj };
    }
    const result = JSON.stringify(redact(obj));
    expect(result).toContain("[max depth]");
  });

  // Long base64 strings often indicate tokens/keys even under innocuous key names
  it("redacts long base64-like strings", () => {
    const result = redact({
      data: "aVeryLongBase64StringThatLooksLikeAToken12345==",
    }) as Record<string, unknown>;

    expect(result.data).toBe("[REDACTED]");
  });
});

// createLogger is the factory for scoped loggers used throughout the app
describe("createLogger", () => {
  beforeEach(() => {
    clearLogHistory();
    setMinLevel("debug");
  });

  // Every log call must appear in the ring buffer for the in-app debug UI
  it("writes entries to history", () => {
    const log = createLogger("test");
    log.info("hello");

    const history = getLogHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.level).toBe("info");
    expect(history[0]?.scope).toBe("test");
    expect(history[0]?.message).toBe("hello");
  });

  // ISO timestamp is essential for correlating logs with server events
  it("includes timestamp", () => {
    const log = createLogger("test");
    log.info("timed");

    const entry = getLogHistory()[0];
    expect(entry?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // Runtime field helps distinguish Electron vs PWA vs browser logs in support
  it("includes runtime field", () => {
    const log = createLogger("test");
    log.info("runtime check");

    const entry = getLogHistory()[0];
    expect(["electron", "pwa", "browser"]).toContain(entry?.runtime);
  });

  // Logger must auto-redact sensitive data passed as structured context
  it("redacts sensitive data in log entries", () => {
    const log = createLogger("test");
    log.info("auth attempt", { username: "john", apiKey: "secret123" });

    const history = getLogHistory();
    expect(history).toHaveLength(1);
    const data = history[0]?.data;
    expect(data).toBeDefined();
    expect((data as Record<string, unknown>).username).toBe("john");
    expect((data as Record<string, unknown>).apiKey).toBe("[REDACTED]");
  });

  // Child loggers inherit parent scope (e.g. "app:api") for hierarchical tracing
  it("creates child loggers with scoped names", () => {
    const parent = createLogger("app");
    const child = parent.child("api");
    child.info("request");

    expect(getLogHistory()[0]?.scope).toBe("app:api");
  });

  // In production, debug/info are suppressed to reduce noise — only warn/error are kept
  it("respects minimum log level", () => {
    setMinLevel("warn");
    const log = createLogger("test");

    log.debug("skip");
    log.info("skip");
    log.warn("keep");
    log.error("keep");

    expect(getLogHistory()).toHaveLength(2);
    expect(getLogHistory()[0]?.level).toBe("warn");
    expect(getLogHistory()[1]?.level).toBe("error");
  });

  it("subscribeLogHistory notifies on new entries and clear", () => {
    const log = createLogger("test");
    let notifyCount = 0;
    const unsub = subscribeLogHistory(() => {
      notifyCount += 1;
    });

    log.info("one");
    expect(notifyCount).toBe(1);

    clearLogHistory();
    expect(notifyCount).toBe(2);
    unsub();

    log.info("after unsub");
    expect(notifyCount).toBe(2);
  });

  // clearLogHistory resets the ring buffer — used when switching instances
  it("clearLogHistory clears buffer", () => {
    const log = createLogger("test");
    log.info("one");
    log.info("two");
    expect(getLogHistory()).toHaveLength(2);

    clearLogHistory();
    expect(getLogHistory()).toHaveLength(0);
  });
});

// Custom transports allow routing logs to external systems (e.g. Sentry, remote server)
describe("custom transport", () => {
  beforeEach(() => {
    clearLogHistory();
    setMinLevel("debug");
  });

  // Transports receive the same LogEntry objects as the ring buffer
  it("receives log entries", () => {
    const entries: LogEntry[] = [];
    const transport: LogTransport = {
      write(entry) {
        entries.push(entry);
      },
    };
    addTransport(transport);

    const log = createLogger("custom");
    log.warn("test transport");

    expect(entries.length).toBeGreaterThanOrEqual(1);
    const found = entries.find((e) => e.message === "test transport");
    expect(found?.scope).toBe("custom");
  });
});

// The ring buffer has a fixed capacity (500) to prevent unbounded memory growth
describe("ring buffer overflow", () => {
  beforeEach(() => {
    clearLogHistory();
    setMinLevel("debug");
  });

  // When capacity is exceeded, oldest entries are evicted first (FIFO)
  it("caps at 500 entries, evicting oldest", () => {
    const log = createLogger("overflow");
    for (let i = 0; i < 510; i++) {
      log.debug(`entry-${i}`);
    }

    const history = getLogHistory();
    expect(history).toHaveLength(500);
    expect(history[0]?.message).toBe("entry-10");
    expect(history[499]?.message).toBe("entry-509");
  });
});

// logApiCall is a convenience wrapper for tracing HTTP requests with auto-level selection
describe("logApiCall", () => {
  beforeEach(() => {
    clearLogHistory();
    setMinLevel("debug");
  });

  // Successful API calls are logged at debug level with method + path
  it("logs debug for a normal API call", () => {
    logApiCall("GET", "/messages", { status: 200, durationMs: 150 });

    const entry = getLogHistory().find((e) => e.scope === "api");
    expect(entry).toBeDefined();
    expect(entry!.level).toBe("debug");
    expect(entry!.message).toBe("GET /messages");
  });

  // Failed API calls are logged at error level so they stand out in production logs
  it("logs error when error option is set", () => {
    logApiCall("POST", "/messages", { error: "Network error" });

    const entry = getLogHistory().find((e) => e.scope === "api");
    expect(entry).toBeDefined();
    expect(entry!.level).toBe("error");
    expect(entry!.message).toBe("POST /messages failed");
    expect((entry!.data as Record<string, unknown>).error).toBe("Network error");
  });

  it("logs debug when request is aborted", () => {
    logApiCall("GET", "/messages", { aborted: true, durationMs: 25 });

    const entry = getLogHistory().find((e) => e.scope === "api");
    expect(entry).toBeDefined();
    expect(entry!.level).toBe("debug");
    expect(entry!.message).toBe("GET /messages aborted");
    expect((entry!.data as Record<string, unknown>).aborted).toBe(true);
  });

  // Slow responses (>3s) are logged as warnings — helps identify backend bottlenecks
  it("logs warn for slow responses (>3000ms)", () => {
    logApiCall("GET", "/users", { durationMs: 5000 });

    const entry = getLogHistory().find((e) => e.scope === "api");
    expect(entry).toBeDefined();
    expect(entry!.level).toBe("warn");
    expect(entry!.message).toBe("GET /users slow");
  });

  // Structured data (method, path, status, duration) enables log aggregation and analysis
  it("includes status and durationMs in data", () => {
    logApiCall("GET", "/messages", { status: 200, durationMs: 100 });

    const entry = getLogHistory().find((e) => e.scope === "api");
    const data = entry!.data as Record<string, unknown>;
    expect(data.method).toBe("GET");
    expect(data.path).toBe("/messages");
    expect(data.status).toBe(200);
    expect(data.durationMs).toBe(100);
  });

  it("includes redacted params in data", () => {
    logApiCall("POST", "/messages", {
      status: 200,
      durationMs: 50,
      params: { type: "stream", password: "secret" },
    });

    const entry = getLogHistory().find((e) => e.scope === "api");
    const data = entry!.data as Record<string, unknown>;
    const params = data.params as Record<string, unknown>;
    expect(params.type).toBe("stream");
    expect(params.password).toBe("[REDACTED]");
  });
});

describe("logAction", () => {
  beforeEach(() => {
    clearLogHistory();
    setMinLevel("debug");
  });

  it("logs info entry under action scope", () => {
    logAction("instance_switched", { instanceId: "abc" });

    const entry = getLogHistory().find((e) => e.scope === "action");
    expect(entry).toBeDefined();
    expect(entry!.level).toBe("info");
    expect(entry!.message).toBe("instance_switched");
    expect((entry!.data as Record<string, unknown>).instanceId).toBe("abc");
  });
});

// logEvent traces real-time events from the Zulip long-polling event loop
describe("logEvent", () => {
  beforeEach(() => {
    clearLogHistory();
    setMinLevel("debug");
  });

  // Events are logged at debug level under "realtime" scope for event loop diagnostics
  it("logs a debug entry with realtime scope", () => {
    logEvent("message", { messageId: 123 });

    const entry = getLogHistory().find((e) => e.scope === "realtime");
    expect(entry).toBeDefined();
    expect(entry!.level).toBe("debug");
    expect(entry!.message).toBe("event: message");
    expect((entry!.data as Record<string, unknown>).messageId).toBe(123);
  });

  // Some events (like heartbeat) carry no payload — data param is optional
  it("works without data argument", () => {
    logEvent("heartbeat");

    const entry = getLogHistory().find((e) => e.scope === "realtime");
    expect(entry).toBeDefined();
    expect(entry!.message).toBe("event: heartbeat");
  });
});

// logStoreAction traces Zustand store mutations for state debugging
describe("logStoreAction", () => {
  beforeEach(() => {
    clearLogHistory();
    setMinLevel("debug");
  });

  // Each store gets its own scope (e.g. "store:chatList") for easy filtering
  it("logs a debug entry with store:name scope", () => {
    logStoreAction("chatList", "addMessage", { messageId: 456 });

    const entry = getLogHistory().find((e) => e.scope === "store:chatList");
    expect(entry).toBeDefined();
    expect(entry!.level).toBe("debug");
    expect(entry!.message).toBe("addMessage");
    expect((entry!.data as Record<string, unknown>).messageId).toBe(456);
  });

  // Simple actions (like clear) don't need payload data
  it("works without data argument", () => {
    logStoreAction("users", "clear");

    const entry = getLogHistory().find((e) => e.scope === "store:users");
    expect(entry).toBeDefined();
    expect(entry!.message).toBe("clear");
  });
});
