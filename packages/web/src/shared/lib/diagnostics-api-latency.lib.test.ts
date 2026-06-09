import { describe, expect, it } from "vitest";
import type { LogEntry } from "~/shared/lib/logger";
import { summarizeApiLogs } from "./diagnostics-api-latency.lib";

describe("summarizeApiLogs", () => {
  it("computes median and slowest api calls", () => {
    const entries: LogEntry[] = [
      {
        timestamp: new Date(1).toISOString(),
        level: "info",
        scope: "api",
        runtime: "browser",
        message: "GET /messages",
        data: { method: "GET", path: "/messages", durationMs: 100 },
      },
      {
        timestamp: new Date(2).toISOString(),
        level: "info",
        scope: "api",
        runtime: "browser",
        message: "GET /register",
        data: { method: "GET", path: "/register", durationMs: 300 },
      },
      {
        timestamp: new Date(3).toISOString(),
        level: "info",
        scope: "api",
        runtime: "browser",
        message: "GET /users",
        data: { method: "GET", path: "/users", durationMs: 200 },
      },
    ];

    const summary = summarizeApiLogs(entries);
    expect(summary.sampleCount).toBe(3);
    expect(summary.medianMs).toBe(200);
    expect(summary.slowest[0]?.durationMs).toBe(300);
  });
});
