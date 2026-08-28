import { invokeUserPresence, type WorkspaceClientOptions } from "~/shared/api/workspace-client";
import { isOnBattery, onBatteryStateChange } from "~/shared/lib/power";
import { createActivityAwareInterval } from "~/shared/lib/visibility";
import type { WindowActivityState } from "~/shared/lib/visibility";

/**
 * Presence heartbeat cadence, by window activity.
 *
 * A heartbeat is a radio wake-up, and on a laptop those dominate the idle power
 * budget far more than the request itself costs, so the cadence follows how close
 * the user is to the window. On battery the whole ladder is stretched: the wake-up
 * itself is the cost, and presence is the least urgent thing the client does.
 *
 * The payload stays `status: "active"`: the heartbeat is only sent while the user
 * is genuinely present, so it never has to claim anything else.
 */
export const WORKSPACE_PRESENCE_REPORT_INTERVAL_MS = 30_000;
export const WORKSPACE_PRESENCE_UNFOCUSED_INTERVAL_MS = 120_000;
export const WORKSPACE_PRESENCE_HIDDEN_INTERVAL_MS = 300_000;
export const WORKSPACE_PRESENCE_BATTERY_MULTIPLIER = 2;

export function workspacePresenceIntervalMs(
  state: WindowActivityState,
  baseIntervalMs: number = WORKSPACE_PRESENCE_REPORT_INTERVAL_MS,
  onBattery = false,
): number {
  const batteryFactor = onBattery ? WORKSPACE_PRESENCE_BATTERY_MULTIPLIER : 1;
  if (state === "active") return baseIntervalMs * batteryFactor;
  const floor =
    state === "visible"
      ? WORKSPACE_PRESENCE_UNFOCUSED_INTERVAL_MS
      : WORKSPACE_PRESENCE_HIDDEN_INTERVAL_MS;
  return Math.max(baseIntervalMs, floor) * batteryFactor;
}

export interface WorkspacePresenceReporterOptions {
  clientOptions: WorkspaceClientOptions;
  userUuid: string;
  reportIntervalMs?: number;
  onError?: (error: unknown) => void;
  invokePresence?: typeof invokeUserPresence;
}

export function startWorkspacePresenceReporter({
  clientOptions,
  userUuid,
  reportIntervalMs = WORKSPACE_PRESENCE_REPORT_INTERVAL_MS,
  onError,
  invokePresence = invokeUserPresence,
}: WorkspacePresenceReporterOptions): () => void {
  const controller = new AbortController();
  let stopped = false;

  function report(): void {
    if (stopped || controller.signal.aborted) return;

    void invokePresence(
      {
        ...clientOptions,
        signal: controller.signal,
      },
      userUuid,
      { status: "active" },
    ).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        onError?.(error);
      }
    });
  }

  report();

  // `runOnFocus` is what shows the user online again straight away on return,
  // rather than after a whole unfocused-length interval.
  const heartbeat = createActivityAwareInterval(report, {
    delayFor: (state) => workspacePresenceIntervalMs(state, reportIntervalMs, isOnBattery()),
    runOnFocus: true,
  });

  // Unplugging should take effect now, not at the end of the current period.
  const unsubscribeBattery = onBatteryStateChange(() => {
    if (!stopped) heartbeat.reschedule();
  });

  return () => {
    stopped = true;
    unsubscribeBattery();
    controller.abort();
    heartbeat.stop();
  };
}
