import { useEffect } from "react";
import type { WorkspaceInstance } from "~/entities/instance/instance.model";
import { startMessengerEventLoopForCredentials } from "~/shared/lib/event-loop";
import {
  abortInactiveInstanceQueueOnTeardown,
  handleInactiveInstanceQueueRegistered,
} from "./layout-inactive-instance-queue.lib";
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
      startEventLoop: ({ credentials, onEvent, onBadQueue, onQueueReady, onQueueRegistered }) => {
        const controller = new AbortController();
        let queueId: string | null = null;
        let stopped = false;
        const instance = instances.find(
          (row) => row.realm === credentials.realm && row.login === credentials.login,
        );
        startMessengerEventLoopForCredentials({
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
          onQueueRegistered: (id, registration) => {
            const nextQueueId = handleInactiveInstanceQueueRegistered({
              queueId: id,
              registration,
              stopped,
              credentials,
              instance,
              onQueueRegistered,
            });
            if (nextQueueId != null) {
              queueId = nextQueueId;
            }
          },
        });
        return () => {
          stopped = true;
          abortInactiveInstanceQueueOnTeardown(queueId, credentials, controller);
        };
      },
    });
  }, [instances, currentInstanceId, enabled, online]);
}
