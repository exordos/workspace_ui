import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initConsoleCapture } from "./console-capture.lib";
import { clearLogHistory, getLogHistory } from "./logger";

describe("initConsoleCapture", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    clearLogHistory();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.restoreAllMocks();
  });

  it("records console.warn to log history", () => {
    cleanup = initConsoleCapture();
    console.warn("network glitch", { code: 503 });

    const entry = getLogHistory().find((e) => e.scope === "console");
    expect(entry).toBeDefined();
    expect(entry!.level).toBe("warn");
    expect(entry!.message).toBe("network glitch");
  });

  it("serializes Date, RegExp, Set, and Map in buffered args", () => {
    cleanup = initConsoleCapture();
    const date = new Date("2026-01-15T12:00:00.000Z");
    const pattern = /foo/gi;
    const ids = new Set([1, 2]);
    const byName = new Map([["alice", 1]]);
    console.log("types", date, pattern, ids, byName);

    const entry = getLogHistory().find((e) => e.scope === "console");
    expect(entry?.data?.args).toEqual([
      "types",
      "2026-01-15T12:00:00.000Z",
      "/foo/gi",
      [1, 2],
      [["alice", 1]],
    ]);
  });

  it("restores original console methods on cleanup", () => {
    cleanup = initConsoleCapture();
    cleanup();
    clearLogHistory();

    console.warn("after restore");
    expect(getLogHistory().find((e) => e.scope === "console")).toBeUndefined();
  });
});
