/**
 * Presence heartbeat cadence.
 *
 * The heartbeat is a radio wake-up on a schedule, so what matters here is how
 * often it fires in each window activity state — and that returning to the
 * window reports immediately instead of after a long unfocused interval.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initVisibilityTracking } from "~/shared/lib/visibility";
import {
  startWorkspacePresenceReporter,
  workspacePresenceIntervalMs,
  WORKSPACE_PRESENCE_BATTERY_MULTIPLIER,
  WORKSPACE_PRESENCE_HIDDEN_INTERVAL_MS,
  WORKSPACE_PRESENCE_REPORT_INTERVAL_MS,
  WORKSPACE_PRESENCE_UNFOCUSED_INTERVAL_MS,
} from "./user-workspace-presence-reporter.lib";

const CLIENT_OPTIONS = { accessToken: "token" } as never;
const USER_UUID = "22222222-2222-4222-8222-222222222222";

function blurWindow(): void {
  window.dispatchEvent(new Event("blur"));
}

function focusWindow(): void {
  window.dispatchEvent(new Event("focus"));
}

describe("workspacePresenceIntervalMs", () => {
  it("slows down as the user moves away from the window", () => {
    expect(workspacePresenceIntervalMs("active")).toBe(WORKSPACE_PRESENCE_REPORT_INTERVAL_MS);
    expect(workspacePresenceIntervalMs("visible")).toBe(WORKSPACE_PRESENCE_UNFOCUSED_INTERVAL_MS);
    expect(workspacePresenceIntervalMs("hidden")).toBe(WORKSPACE_PRESENCE_HIDDEN_INTERVAL_MS);
  });

  it("never reports faster than the caller-supplied base interval", () => {
    expect(workspacePresenceIntervalMs("visible", 600_000)).toBe(600_000);
  });

  it("stretches the whole ladder on battery", () => {
    expect(workspacePresenceIntervalMs("active", undefined, true)).toBe(
      WORKSPACE_PRESENCE_REPORT_INTERVAL_MS * WORKSPACE_PRESENCE_BATTERY_MULTIPLIER,
    );
    expect(workspacePresenceIntervalMs("hidden", undefined, true)).toBe(
      WORKSPACE_PRESENCE_HIDDEN_INTERVAL_MS * WORKSPACE_PRESENCE_BATTERY_MULTIPLIER,
    );
  });
});

describe("startWorkspacePresenceReporter", () => {
  let stopTracking: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    stopTracking = initVisibilityTracking();
    focusWindow();
  });

  afterEach(() => {
    stopTracking();
    vi.useRealTimers();
  });

  it("reports every 30s while the window is focused", () => {
    const invokePresence = vi.fn().mockResolvedValue({});
    const stop = startWorkspacePresenceReporter({
      clientOptions: CLIENT_OPTIONS,
      userUuid: USER_UUID,
      invokePresence,
    });

    expect(invokePresence).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(90_000);
    expect(invokePresence).toHaveBeenCalledTimes(4);

    stop();
  });

  it("drops to the unfocused cadence when the window loses focus", () => {
    const invokePresence = vi.fn().mockResolvedValue({});
    const stop = startWorkspacePresenceReporter({
      clientOptions: CLIENT_OPTIONS,
      userUuid: USER_UUID,
      invokePresence,
    });
    invokePresence.mockClear();

    blurWindow();
    // Four focused intervals would have been four heartbeats; unfocused is one.
    vi.advanceTimersByTime(120_000);
    expect(invokePresence).toHaveBeenCalledTimes(1);

    stop();
  });

  it("reports immediately when the window regains focus", () => {
    const invokePresence = vi.fn().mockResolvedValue({});
    const stop = startWorkspacePresenceReporter({
      clientOptions: CLIENT_OPTIONS,
      userUuid: USER_UUID,
      invokePresence,
    });

    blurWindow();
    vi.advanceTimersByTime(5_000);
    invokePresence.mockClear();

    focusWindow();
    expect(invokePresence).toHaveBeenCalledTimes(1);

    stop();
  });

  it("stops reporting after teardown", () => {
    const invokePresence = vi.fn().mockResolvedValue({});
    const stop = startWorkspacePresenceReporter({
      clientOptions: CLIENT_OPTIONS,
      userUuid: USER_UUID,
      invokePresence,
    });
    stop();
    invokePresence.mockClear();

    vi.advanceTimersByTime(600_000);
    expect(invokePresence).not.toHaveBeenCalled();
  });
});
