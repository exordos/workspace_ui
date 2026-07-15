import type { WorkspaceInstance } from "~/entities/instance/instance.model";
import { MULTI_ORG_UNREAD_REFRESH_DEBOUNCE_MS } from "~/shared/config/constants";
import { resolveIamAccessToken } from "~/shared/lib/iam-instance.lib";
import type { WorkspaceEvent } from "~/shared/types/workspace-event";
import type { StartInactiveInstanceEventStreamsOptions } from "./layout-multi-org-event-streams.types";

export type {
  StartCredentialEventLoopFn,
  StartCredentialEventLoopOptions,
} from "./layout-multi-org-event-streams.types";

function shouldRefreshUnreadForEvent(event: WorkspaceEvent): boolean {
  return (
    event.object_type === "message" ||
    event.object_type === "message_reaction" ||
    event.object_type === "stream" ||
    event.object_type === "topic"
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
    debounceMs = MULTI_ORG_UNREAD_REFRESH_DEBOUNCE_MS,
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

  const scheduleRefresh = (instance: WorkspaceInstance) => {
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
    const accessToken = resolveIamAccessToken(instance);
    if (accessToken.length === 0) {
      continue;
    }
    const stop = startEventLoop({
      credentials: {
        realm: instance.realm,
        workspaceOrgOrigin: instance.workspaceOrgOrigin,
        login: instance.login,
        accessToken,
      },
      onEvent: (event) => {
        if (shouldRefreshUnreadForEvent(event)) {
          scheduleRefresh(instance);
        }
      },
      onQueueReady: () => {
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
