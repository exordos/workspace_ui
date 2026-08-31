/**
 * Presence heartbeat cadence.
 *
 * The heartbeat is a radio wake-up on a schedule, so what matters here is how
 * often it fires in each window activity state — and that returning to the
 * window reports immediately instead of after a long unfocused interval.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initVisibilityTracking } from "~/shared/lib/visibility";
import { writeManualStatus } from "./user-manual-status.lib";
import {
  startWorkspacePresenceReporter,
  workspacePresenceIntervalMs,
  WORKSPACE_PRESENCE_BATTERY_MULTIPLIER,
  WORKSPACE_PRESENCE_HIDDEN_INTERVAL_MS,
  WORKSPACE_PRESENCE_REPORT_INTERVAL_MS,
  WORKSPACE_PRESENCE_UNFOCUSED_BATTERY_INTERVAL_MS,
  WORKSPACE_PRESENCE_UNFOCUSED_INTERVAL_MS,
} from "./user-workspace-presence-reporter.lib";

const powerState = vi.hoisted(() => ({ onBattery: false }));

vi.mock("~/shared/lib/power", () => ({
  isOnBattery: () => powerState.onBattery,
}));

const CLIENT_OPTIONS = { accessToken: "token" } as never;
const USER_UUID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  powerState.onBattery = false;
});

function blurWindow(): void {
  window.dispatchEvent(new Event("blur"));
}

function focusWindow(): void {
  window.dispatchEvent(new Event("focus"));
}

describe("workspacePresenceIntervalMs", () => {
  it("uses the cadence configured for each activity state", () => {
    expect(workspacePresenceIntervalMs("active")).toBe(WORKSPACE_PRESENCE_REPORT_INTERVAL_MS);
    expect(workspacePresenceIntervalMs("visible")).toBe(WORKSPACE_PRESENCE_UNFOCUSED_INTERVAL_MS);
    expect(workspacePresenceIntervalMs("hidden")).toBe(WORKSPACE_PRESENCE_HIDDEN_INTERVAL_MS);
  });

  it("caps only the visible unfocused cadence below the backend offline timeout", () => {
    expect(workspacePresenceIntervalMs("active", 600_000)).toBe(600_000);
    expect(workspacePresenceIntervalMs("visible", 600_000)).toBe(
      WORKSPACE_PRESENCE_UNFOCUSED_INTERVAL_MS,
    );
    expect(workspacePresenceIntervalMs("hidden", 600_000)).toBe(600_000);
  });

  it("stretches the cadence on battery while capping only visible unfocused", () => {
    expect(workspacePresenceIntervalMs("active", undefined, true)).toBe(
      WORKSPACE_PRESENCE_REPORT_INTERVAL_MS * WORKSPACE_PRESENCE_BATTERY_MULTIPLIER,
    );
    expect(workspacePresenceIntervalMs("visible", undefined, true)).toBe(
      WORKSPACE_PRESENCE_UNFOCUSED_BATTERY_INTERVAL_MS,
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

  it("keeps the current deadline when the power source changes", () => {
    const invokePresence = vi.fn().mockResolvedValue({});
    const stop = startWorkspacePresenceReporter({
      clientOptions: CLIENT_OPTIONS,
      userUuid: USER_UUID,
      invokePresence,
    });

    blurWindow();
    invokePresence.mockClear();
    vi.advanceTimersByTime(119_000);

    powerState.onBattery = true;
    vi.advanceTimersByTime(1_000);
    expect(invokePresence).toHaveBeenCalledTimes(1);

    invokePresence.mockClear();
    vi.advanceTimersByTime(159_999);
    expect(invokePresence).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(invokePresence).toHaveBeenCalledTimes(1);

    stop();
  });

  it("keeps the visible heartbeat within 160s after losing focus", () => {
    powerState.onBattery = true;
    const invokePresence = vi.fn().mockResolvedValue({});
    const stop = startWorkspacePresenceReporter({
      clientOptions: CLIENT_OPTIONS,
      userUuid: USER_UUID,
      invokePresence,
    });

    invokePresence.mockClear();
    vi.advanceTimersByTime(59_999);
    blurWindow();
    vi.advanceTimersByTime(100_000);
    expect(invokePresence).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
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

describe("startWorkspacePresenceReporter status", () => {
  let stopTracking: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    stopTracking = initVisibilityTracking();
    focusWindow();
    writeManualStatus(USER_UUID, null);
  });

  afterEach(() => {
    stopTracking();
    writeManualStatus(USER_UUID, null);
    vi.useRealTimers();
  });

  it("reports active when the user chose nothing", () => {
    const invokePresence = vi.fn().mockResolvedValue({});
    const stop = startWorkspacePresenceReporter({
      clientOptions: CLIENT_OPTIONS,
      userUuid: USER_UUID,
      invokePresence,
    });

    expect(invokePresence).toHaveBeenCalledWith(expect.anything(), USER_UUID, {
      status: "active",
    });
    stop();
  });

  it("does not push a deliberately away user back online", () => {
    writeManualStatus(USER_UUID, "idle");
    const invokePresence = vi.fn().mockResolvedValue({});
    const stop = startWorkspacePresenceReporter({
      clientOptions: CLIENT_OPTIONS,
      userUuid: USER_UUID,
      invokePresence,
    });

    expect(invokePresence).toHaveBeenCalledWith(expect.anything(), USER_UUID, { status: "idle" });

    invokePresence.mockClear();
    vi.advanceTimersByTime(120_000);
    for (const call of invokePresence.mock.calls) {
      expect(call[2]).toMatchObject({ status: "idle" });
    }
    stop();
  });

  it("leaves do-not-disturb held by the account alone", () => {
    const invokePresence = vi.fn().mockResolvedValue({});
    const stop = startWorkspacePresenceReporter({
      clientOptions: CLIENT_OPTIONS,
      userUuid: USER_UUID,
      invokePresence,
      getAccountStatus: () => "do_not_disturb",
    });

    expect(invokePresence).toHaveBeenCalledWith(expect.anything(), USER_UUID, {
      status: "do_not_disturb",
    });
    stop();
  });

  it("omits the status text and emoji until they are known", () => {
    const invokePresence = vi.fn().mockResolvedValue({});
    const stop = startWorkspacePresenceReporter({
      clientOptions: CLIENT_OPTIONS,
      userUuid: USER_UUID,
      invokePresence,
      // The roster has not loaded the account yet: sending nulls would clear the
      // status text and emoji the user already has.
      getStatusDecoration: () => null,
    });

    expect(invokePresence).toHaveBeenCalledWith(expect.anything(), USER_UUID, {
      status: "active",
    });
    stop();
  });

  it("carries the status text and emoji so a heartbeat cannot clear them", () => {
    const invokePresence = vi.fn().mockResolvedValue({});
    const stop = startWorkspacePresenceReporter({
      clientOptions: CLIENT_OPTIONS,
      userUuid: USER_UUID,
      invokePresence,
      getStatusDecoration: () => ({ emoji: "🌴", text: "on holiday" }),
    });

    expect(invokePresence).toHaveBeenCalledWith(expect.anything(), USER_UUID, {
      status: "active",
      emoji: "🌴",
      text: "on holiday",
    });
    stop();
  });
});
