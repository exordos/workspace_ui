import type { ZulipInstance } from "~/entities/instance/instance.model";
import type { StartInactiveInstanceUnreadPollingOptions } from "./layout-multi-org-polling.types";

const DEFAULT_POLL_INTERVAL_MS = 60_000;

export function startInactiveInstanceUnreadPolling(
  options: StartInactiveInstanceUnreadPollingOptions,
): () => void {
  const {
    instances,
    currentInstanceId,
    enabled,
    online,
    fetchUnreadCount,
    setUnreadCount,
    onError,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  } = options;

  if (!enabled || !online || instances.length <= 1) {
    return () => {};
  }

  const inactiveInstances = instances.filter((instance) => instance.id !== currentInstanceId);
  if (inactiveInstances.length === 0) {
    return () => {};
  }

  const controllers = new Set<AbortController>();
  let cancelled = false;
  const pollingState = { inProgress: false };

  const runPoll = () => {
    if (cancelled || pollingState.inProgress) {
      return;
    }

    pollingState.inProgress = true;
    void Promise.all(
      inactiveInstances.map(async (instance) => {
        const controller = new AbortController();
        controllers.add(controller);
        try {
          const unreadCount = await fetchUnreadCount(instance, controller.signal);
          if (cancelled || unreadCount == null) return;
          setUnreadCount(instance.id, unreadCount);
        } catch (error) {
          if (!cancelled) {
            onError?.(instance.id, error);
          }
        } finally {
          controllers.delete(controller);
        }
      }),
    ).finally(() => {
      pollingState.inProgress = false;
    });
  };

  runPoll();
  const intervalId = window.setInterval(() => {
    runPoll();
  }, pollIntervalMs);

  return () => {
    cancelled = true;
    window.clearInterval(intervalId);
    controllers.forEach((controller) => controller.abort());
    controllers.clear();
  };
}
