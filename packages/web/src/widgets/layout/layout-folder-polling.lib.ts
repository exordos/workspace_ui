const DEFAULT_FOLDER_POLL_INTERVAL_MS = 60_000;

interface StartFolderPollingOptions {
  enabled: boolean;
  refreshFolders: () => Promise<void> | void;
  pollIntervalMs?: number;
  runImmediately?: boolean;
}

export function startFolderPolling({
  enabled,
  refreshFolders,
  pollIntervalMs = DEFAULT_FOLDER_POLL_INTERVAL_MS,
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
