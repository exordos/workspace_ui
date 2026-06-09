import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearLogHistory, getLogHistory, setMinLevel } from "~/shared/lib/logger";
import {
  isPipelineTraceEnabled,
  logChatListFlow,
  logMessageFlow,
  logSidebarUnreadFlow,
  resetPipelineTraceForTests,
  setPipelineTrace,
} from "./pipeline-trace.lib";

describe("pipeline-trace.lib", () => {
  beforeEach(() => {
    clearLogHistory();
    setMinLevel("debug");
    resetPipelineTraceForTests();
  });

  afterEach(() => {
    resetPipelineTraceForTests();
  });

  it("does not log when trace mode is off", () => {
    logMessageFlow("merge:done", { count: 1 });
    expect(getLogHistory()).toHaveLength(0);
  });

  it("logs to trace scope when channel is enabled", () => {
    setPipelineTrace("messages");
    logMessageFlow("merge:done", { count: 1 });

    const entry = getLogHistory().find((e) => e.scope === "trace:messages");
    expect(entry).toBeDefined();
    expect(entry!.level).toBe("debug");
    expect(entry!.message).toMatch(/merge:done/);
  });

  it("isolates channels", () => {
    setPipelineTrace("chat-list");
    logMessageFlow("should-not-appear");
    logChatListFlow("snapshot:hydrate");

    expect(getLogHistory().some((e) => e.scope === "trace:messages")).toBe(false);
    expect(getLogHistory().some((e) => e.scope === "trace:chat-list")).toBe(true);
  });

  it("enables all channels with all mode", () => {
    setPipelineTrace("all");
    expect(isPipelineTraceEnabled("messages")).toBe(true);
    expect(isPipelineTraceEnabled("sidebar-unread")).toBe(true);

    logSidebarUnreadFlow("badge:bump");
    expect(getLogHistory().some((e) => e.scope === "trace:sidebar-unread")).toBe(true);
  });

  it("supports multiple channels", () => {
    setPipelineTrace(["messages", "folders"]);
    expect(isPipelineTraceEnabled("messages")).toBe(true);
    expect(isPipelineTraceEnabled("folders")).toBe(true);
    expect(isPipelineTraceEnabled("chat-list")).toBe(false);
  });
});
