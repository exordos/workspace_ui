/**
 * Tests for OS power-state forwarding.
 *
 * The renderer cannot see sleep/wake or the battery on its own, so everything here
 * depends on the Electron bridge being wired correctly — and on the browser build
 * degrading to "no bridge, no change in behaviour".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initPowerTracking, isOnBattery, onBatteryStateChange, onPowerResume } from "./power";
import { getActivityState, initVisibilityTracking } from "./visibility";

interface PowerEvent {
  kind: "suspend" | "resume" | "on-battery" | "on-ac";
}

function installBridge(initialOnBattery = false) {
  let emit: ((event: PowerEvent) => void) | null = null;
  let emitActivity: ((event: { focused: boolean }) => void) | null = null;
  const unsubscribe = vi.fn();
  (window as unknown as Record<string, unknown>).electronAPI = {
    window: {
      onActivity: (callback: (event: { focused: boolean }) => void) => {
        emitActivity = callback;
        return vi.fn();
      },
    },
    power: {
      getState: vi.fn().mockResolvedValue({ onBattery: initialOnBattery }),
      onChange: (callback: (event: PowerEvent) => void) => {
        emit = callback;
        return unsubscribe;
      },
    },
  };
  return {
    emit: (event: PowerEvent) => emit?.(event),
    emitActivity: (focused: boolean) => emitActivity?.({ focused }),
    unsubscribe,
  };
}

describe("power", () => {
  let stop: () => void = () => {};

  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>).electronAPI;
  });

  afterEach(() => {
    stop();
    stop = () => {};
    delete (window as unknown as Record<string, unknown>).electronAPI;
  });

  it("is inert without the Electron bridge", () => {
    const resume = vi.fn();
    stop = initPowerTracking();
    onPowerResume(resume);

    expect(isOnBattery()).toBe(false);
    expect(resume).not.toHaveBeenCalled();
  });

  it("reports a wake from sleep so callers can reconnect at once", () => {
    const bridge = installBridge();
    stop = initPowerTracking();
    const resume = vi.fn();
    onPowerResume(resume);

    bridge.emit({ kind: "suspend" });
    expect(resume).not.toHaveBeenCalled();

    bridge.emit({ kind: "resume" });
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("tracks the battery state and notifies only on a change", () => {
    const bridge = installBridge();
    stop = initPowerTracking();
    const changed = vi.fn();
    onBatteryStateChange(changed);

    bridge.emit({ kind: "on-battery" });
    expect(isOnBattery()).toBe(true);
    expect(changed).toHaveBeenCalledWith(true);

    bridge.emit({ kind: "on-battery" });
    expect(changed).toHaveBeenCalledTimes(1);

    bridge.emit({ kind: "on-ac" });
    expect(isOnBattery()).toBe(false);
    expect(changed).toHaveBeenLastCalledWith(false);
  });

  it("reads the initial battery state from the bridge", async () => {
    installBridge(true);
    stop = initPowerTracking();

    await vi.waitFor(() => expect(isOnBattery()).toBe(true));
  });

  it("drives the activity state from the main process focus signal", () => {
    const bridge = installBridge();
    const stopVisibility = initVisibilityTracking();
    stop = initPowerTracking();

    bridge.emitActivity(false);
    expect(getActivityState()).toBe("visible");

    bridge.emitActivity(true);
    expect(getActivityState()).toBe("active");

    stopVisibility();
  });

  it("unsubscribes from the bridge on teardown", () => {
    const bridge = installBridge();
    const teardown = initPowerTracking();
    teardown();

    expect(bridge.unsubscribe).toHaveBeenCalled();
  });
});
