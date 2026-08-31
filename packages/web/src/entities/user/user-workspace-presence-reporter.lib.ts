import type { WorkspaceMessengerUserStatus } from "~/shared/api/messenger.types";
import { invokeUserPresence, type WorkspaceClientOptions } from "~/shared/api/workspace-client";
import { isOnBattery } from "~/shared/lib/power";
import { getLocalPresenceStatus, onLocalPresenceChange } from "~/shared/lib/presence";
import { createActivityAwareInterval } from "~/shared/lib/visibility";
import type { WindowActivityState } from "~/shared/lib/visibility";
import { readManualStatus } from "./user-manual-status.lib";
import { resolveWorkspaceHeartbeatStatus } from "./user-presence-status.lib";

/**
 * Presence heartbeat cadence, by window activity.
 *
 * A heartbeat is a radio wake-up, and on a laptop those dominate the idle power
 * budget far more than the request itself costs, so the cadence follows how close
 * the user is to the window. On battery the whole ladder is stretched: the wake-up
 * itself is the cost, and presence is the least urgent thing the client does.
 *
 * What the heartbeat is allowed to claim is decided by
 * `resolveWorkspaceHeartbeatStatus`; see `docs/PRESENCE_AND_STATUS.md`.
 */
export const WORKSPACE_PRESENCE_REPORT_INTERVAL_MS = 30_000;
export const WORKSPACE_PRESENCE_UNFOCUSED_INTERVAL_MS = 120_000;
export const WORKSPACE_PRESENCE_UNFOCUSED_BATTERY_INTERVAL_MS = 160_000;
export const WORKSPACE_PRESENCE_HIDDEN_INTERVAL_MS = 300_000;
export const WORKSPACE_PRESENCE_BATTERY_MULTIPLIER = 2;

export function workspacePresenceIntervalMs(
  state: WindowActivityState,
  baseIntervalMs: number = WORKSPACE_PRESENCE_REPORT_INTERVAL_MS,
  onBattery = false,
): number {
  const batteryFactor = onBattery ? WORKSPACE_PRESENCE_BATTERY_MULTIPLIER : 1;
  if (state === "active") return baseIntervalMs * batteryFactor;
  if (state === "visible") {
    return onBattery
      ? WORKSPACE_PRESENCE_UNFOCUSED_BATTERY_INTERVAL_MS
      : WORKSPACE_PRESENCE_UNFOCUSED_INTERVAL_MS;
  }
  return Math.max(baseIntervalMs, WORKSPACE_PRESENCE_HIDDEN_INTERVAL_MS) * batteryFactor;
}

export interface WorkspacePresenceReporterOptions {
  clientOptions: WorkspaceClientOptions;
  userUuid: string;
  reportIntervalMs?: number;
  onError?: (error: unknown) => void;
  invokePresence?: typeof invokeUserPresence;
  /** Status the account currently holds on the server, so DND is not overwritten. */
  getAccountStatus?: () => WorkspaceMessengerUserStatus | null;
  /**
   * Current status text and emoji, resent so a heartbeat cannot clear them.
   * Returns null while they are not known — sending nulls would clear them.
   */
  getStatusDecoration?: () => { emoji: string | null; text: string | null } | null;
}

export function startWorkspacePresenceReporter({
  clientOptions,
  userUuid,
  reportIntervalMs = WORKSPACE_PRESENCE_REPORT_INTERVAL_MS,
  onError,
  invokePresence = invokeUserPresence,
  getAccountStatus = () => null,
  getStatusDecoration,
}: WorkspacePresenceReporterOptions): () => void {
  const controller = new AbortController();
  let stopped = false;
  let lastReportAt = Date.now();

  function report(): void {
    if (stopped || controller.signal.aborted) return;

    const status = resolveWorkspaceHeartbeatStatus({
      localPresence: getLocalPresenceStatus(),
      manualStatus: readManualStatus(userUuid),
      accountStatus: getAccountStatus(),
    });
    if (status == null) return;
    lastReportAt = Date.now();

    // The status text and emoji ride along on every heartbeat. Whether the server
    // treats an omitted field as "unchanged" or as "cleared" is not something this
    // client can see, so it states the values when it knows them and omits the
    // fields entirely when it does not.
    const decoration = getStatusDecoration?.() ?? null;

    void invokePresence(
      {
        ...clientOptions,
        signal: controller.signal,
      },
      userUuid,
      decoration == null ? { status } : { status, emoji: decoration.emoji, text: decoration.text },
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
    delayFor: (state) => {
      const interval = workspacePresenceIntervalMs(state, reportIntervalMs, isOnBattery());
      if (state !== "visible") return interval;

      // Losing focus must not restart the visible allowance from zero.
      return Math.max(0, interval - (Date.now() - lastReportAt));
    },
    runOnFocus: true,
  });

  // Going idle, or coming back from it, should reach the server when it happens
  // rather than at the next interval — which off-focus can be minutes away.
  const unsubscribePresence = onLocalPresenceChange(() => {
    if (!stopped) report();
  });

  return () => {
    stopped = true;
    unsubscribePresence();
    controller.abort();
    heartbeat.stop();
  };
}
