import type { ZulipInstance } from "~/entities/instance";
import type { ZulipCredentials, ZulipEvent } from "~/shared/api/zulip.types";

export interface StartCredentialEventLoopOptions {
  credentials: ZulipCredentials;
  onEvent: (event: ZulipEvent) => void;
  onBadQueue?: () => void;
  onReconnect?: () => void;
}

export type StartCredentialEventLoopFn = (options: StartCredentialEventLoopOptions) => () => void;

interface StartInactiveInstanceEventStreamsOptions {
  instances: readonly ZulipInstance[];
  currentInstanceId: string | null;
  enabled: boolean;
  online: boolean;
  refreshUnreadForInstance: (instance: ZulipInstance) => Promise<void> | void;
  startEventLoop: StartCredentialEventLoopFn;
  onError?: (instanceId: string, error: unknown) => void;
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 300;

function shouldRefreshUnreadForEvent(event: ZulipEvent): boolean {
  return (
    event.type === "message" ||
    event.type === "update_message_flags" ||
    event.type === "delete_message" ||
    event.type === "subscription" ||
    event.type === "user_topic"
  );
}

export function startInactiveInstanceEventStreams(
  options: StartInactiveInstanceEventStreamsOptions,
): () => void {
  const {
    instances,
    currentInstanceId,
    enabled,
    online,
    refreshUnreadForInstance,
    startEventLoop,
    onError,
    debounceMs = DEFAULT_DEBOUNCE_MS,
  } = options;

  if (!enabled || !online || instances.length <= 1) {
    return () => {};
  }

  const inactiveInstances = instances.filter((instance) => instance.id !== currentInstanceId);
  if (inactiveInstances.length === 0) {
    return () => {};
  }

  const stopEventLoops: (() => void)[] = [];
  const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let cancelled = false;

  const scheduleRefresh = (instance: ZulipInstance) => {
    if (cancelled) return;
    const existingTimer = refreshTimers.get(instance.id);
    if (existingTimer != null) {
      clearTimeout(existingTimer);
    }
    const timerId = setTimeout(() => {
      refreshTimers.delete(instance.id);
      Promise.resolve(refreshUnreadForInstance(instance)).catch((error) => {
        if (!cancelled) {
          onError?.(instance.id, error);
        }
      });
    }, debounceMs);
    refreshTimers.set(instance.id, timerId);
  };

  for (const instance of inactiveInstances) {
    const stop = startEventLoop({
      credentials: {
        realm: instance.realm,
        email: instance.email,
        apiKey: instance.apiKey,
      },
      onEvent: (event) => {
        if (shouldRefreshUnreadForEvent(event)) {
          scheduleRefresh(instance);
        }
      },
      onReconnect: () => {
        scheduleRefresh(instance);
      },
      onBadQueue: () => {
        scheduleRefresh(instance);
      },
    });
    stopEventLoops.push(stop);
  }

  return () => {
    cancelled = true;
    for (const timerId of refreshTimers.values()) {
      clearTimeout(timerId);
    }
    refreshTimers.clear();
    for (const stop of stopEventLoops) {
      stop();
    }
  };
}
