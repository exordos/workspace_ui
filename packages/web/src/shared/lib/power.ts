/**
 * OS power state, forwarded from the Electron main process.
 *
 * The renderer cannot observe any of this on its own:
 *   - after the machine wakes, the app would otherwise sit until its own idle
 *     watchdog expires before noticing the connection is stale;
 *   - a laptop running off the battery looks exactly like one on mains power,
 *     so background work keeps its plugged-in cadence.
 *
 * In the browser build there is no bridge, so `isOnBattery()` stays false and
 * nothing subscribes — every caller keeps its normal behaviour.
 */
import { getElectronAPI } from "./electron";
import { createLogger } from "./logger";
import { setExternalWindowFocus } from "./visibility";

const log = createLogger("power");

type ResumeCallback = () => void;
type BatteryCallback = (onBattery: boolean) => void;

const resumeListeners = new Set<ResumeCallback>();
const batteryListeners = new Set<BatteryCallback>();

let onBattery = false;
let suspendedAt: number | null = null;

export function isOnBattery(): boolean {
  return onBattery;
}

/** Fires when the machine wakes from sleep. */
export function onPowerResume(callback: ResumeCallback): () => void {
  resumeListeners.add(callback);
  return () => resumeListeners.delete(callback);
}

export function onBatteryStateChange(callback: BatteryCallback): () => void {
  batteryListeners.add(callback);
  return () => batteryListeners.delete(callback);
}

function setBattery(next: boolean): void {
  if (onBattery === next) return;
  onBattery = next;
  log.info("Power source changed", { onBattery: next });
  for (const cb of batteryListeners) {
    try {
      cb(next);
    } catch {
      /* listener must not break others */
    }
  }
}

function emitResume(): void {
  const sleptMs = suspendedAt == null ? 0 : Date.now() - suspendedAt;
  suspendedAt = null;
  log.info("Machine resumed", { sleptMs });
  for (const cb of resumeListeners) {
    try {
      cb();
    } catch {
      /* listener must not break others */
    }
  }
}

/** Subscribe to main-process power and window-focus events. No-op outside Electron. */
export function initPowerTracking(): () => void {
  const api = getElectronAPI();
  if (api == null) return () => {};

  const unsubscribeWindowActivity =
    api.window?.onActivity?.(({ focused }) => setExternalWindowFocus(focused)) ?? (() => {});

  if (api.power == null) return unsubscribeWindowActivity;

  void api.power
    .getState()
    .then((state) => setBattery(state.onBattery))
    .catch(() => {
      /* the initial read is best-effort; events still arrive */
    });

  const unsubscribe = api.power.onChange(({ kind }) => {
    if (kind === "suspend") {
      suspendedAt = Date.now();
      return;
    }
    if (kind === "resume") {
      emitResume();
      return;
    }
    setBattery(kind === "on-battery");
  });

  return () => {
    unsubscribeWindowActivity();
    unsubscribe();
  };
}
