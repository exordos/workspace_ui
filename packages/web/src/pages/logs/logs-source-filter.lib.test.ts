import { describe, expect, it } from "vitest";
import type { LogEntry } from "~/shared/lib/logger";
import { matchesLogSourceFilter } from "./logs-source-filter.lib";

function entry(scope: string): LogEntry {
  return {
    level: "info",
    scope,
    message: "test",
    timestamp: "2026-01-01T00:00:00.000Z",
    runtime: "browser",
  };
}

describe("matchesLogSourceFilter", () => {
  it("filters api scope", () => {
    expect(matchesLogSourceFilter(entry("api"), "api")).toBe(true);
    expect(matchesLogSourceFilter(entry("console"), "api")).toBe(false);
  });

  it("filters action-related scopes", () => {
    expect(matchesLogSourceFilter(entry("action"), "actions")).toBe(true);
    expect(matchesLogSourceFilter(entry("auth"), "actions")).toBe(true);
    expect(matchesLogSourceFilter(entry("realtime"), "actions")).toBe(true);
    expect(matchesLogSourceFilter(entry("store:chatList"), "actions")).toBe(false);
  });

  it("filters app as non-api non-console non-action", () => {
    expect(matchesLogSourceFilter(entry("store:chatList"), "app")).toBe(true);
    expect(matchesLogSourceFilter(entry("api"), "app")).toBe(false);
  });
});
