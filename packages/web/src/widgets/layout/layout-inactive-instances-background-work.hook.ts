import { useEffect } from "react";
import type { WorkspaceInstance } from "~/entities/instance/instance.model";
import { startMessengerEventLoopForCredentials } from "~/shared/lib/event-loop";
import { startInactiveInstanceEventStreams } from "./layout-multi-org-event-streams.lib";

export function useInactiveInstancesBackgroundWork(options: {
  instances: WorkspaceInstance[];
  currentInstanceId: string | null;
  enabled: boolean;
  online: boolean;
  setUnreadCount: (instanceId: string, unreadCount: number) => void;
  setDmUnreadCount: (instanceId: string, dmUnreadCount: number) => void;
}): void {
  const { instances, currentInstanceId, enabled, online } = options;

  useEffect(() => {
    return startInactiveInstanceEventStreams({
      instances,
      currentInstanceId,
      enabled,
      online,
      refreshUnreadForInstance: async () => {},
      startEventLoop: ({ credentials, onEvent, onBadQueue, onQueueReady }) => {
        const controller = new AbortController();
        const instance = instances.find(
          (row) => row.realm === credentials.realm && row.login === credentials.login,
        );
        startMessengerEventLoopForCredentials({
          // The Workspace gateway backend does not expose old event queues.
          enabled: false,
          credentials,
          instanceId: instance?.id,
          signal: controller.signal,
          onEvent,
          onBadQueue,
          onQueueReady,
          eventTypes: [
            "message",
            "update_message_flags",
            "delete_message",
            "subscription",
            "user_topic",
          ],
        });
        return () => {
          controller.abort();
        };
      },
    });
  }, [instances, currentInstanceId, enabled, online]);
}
