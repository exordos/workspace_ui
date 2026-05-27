/**
 * Periodic folder-sync polling: folders list + selective folder-items refresh.
 * Startup and reconnect use full snapshot via bootstrap / layout-reconnect-coordinator.
 */
import { FOLDER_SYNC_POLL_INTERVAL_MS } from "~/shared/config/constants";
import type { StartFolderPollingOptions } from "./layout-folder-polling.types";

export function startFolderPolling({
  enabled,
  refreshFolders,
  pollIntervalMs = FOLDER_SYNC_POLL_INTERVAL_MS,
  runImmediately = false,
}: StartFolderPollingOptions): () => void {
  if (!enabled) return () => {};

  let cancelled = false;
  let inProgress = false;

  const tick = (): void => {
    if (cancelled || inProgress) return;
    inProgress = true;
    Promise.resolve(refreshFolders())
      .catch(() => {
        /* best-effort folder refresh polling */
      })
      .finally(() => {
        inProgress = false;
      });
  };

  if (runImmediately) {
    tick();
  }

  const intervalId = window.setInterval(() => {
    tick();
  }, pollIntervalMs);

  return () => {
    cancelled = true;
    window.clearInterval(intervalId);
  };
}
