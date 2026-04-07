import { useEffect } from "react";
import type { ZulipInstance } from "~/entities/instance/instance.model";
import {
  deleteQueue,
  fetchUnreadMessagesCountForCredentials,
} from "~/shared/api/zulip";
import { startZulipEventLoopForCredentials } from "~/shared/lib/event-loop";
import { startInactiveInstanceEventStreams } from "./layout-multi-org-event-streams.lib";
import { startInactiveInstanceUnreadPolling } from "./layout-multi-org-polling.lib";

export function useInactiveInstancesBackgroundWork(options: {
  instances: ZulipInstance[];
  currentInstanceId: string | null;
  enabled: boolean;
  online: boolean;
  setUnreadCount: (instanceId: string, unreadCount: number) => void;
}): void {
  const { instances, currentInstanceId, enabled, online, setUnreadCount } = options;

  useEffect(() => {
    return startInactiveInstanceEventStreams({
      instances,
      currentInstanceId,
      enabled,
      online,
      refreshUnreadForInstance: async (instance) => {
        const unreadCount = await fetchUnreadMessagesCountForCredentials({
          realm: instance.realm,
          email: instance.email,
          apiKey: instance.apiKey,
        });
        if (unreadCount != null) {
          setUnreadCount(instance.id, unreadCount);
        }
      },
      startEventLoop: ({ credentials, onEvent, onBadQueue, onReconnect }) => {
        const controller = new AbortController();
        let queueId: string | null = null;
        let stopped = false;
        startZulipEventLoopForCredentials({
          credentials,
          signal: controller.signal,
          onEvent,
          onBadQueue,
          onReconnect,
          eventTypes: [
            "message",
            "update_message_flags",
            "delete_message",
            "subscription",
            "user_topic",
          ],
          onQueueRegistered: (id) => {
            if (stopped) {
              deleteQueue(id, credentials).catch(() => {});
              return;
            }
            queueId = id;
          },
        });
        return () => {
          stopped = true;
          if (queueId) {
            deleteQueue(queueId, credentials).catch(() => {});
          }
          controller.abort();
        };
      },
    });
  }, [instances, currentInstanceId, enabled, online, setUnreadCount]);

  useEffect(() => {
    return startInactiveInstanceUnreadPolling({
      instances,
      currentInstanceId,
      enabled,
      online,
      setUnreadCount,
      fetchUnreadCount: (instance, signal) =>
        fetchUnreadMessagesCountForCredentials(
          {
            realm: instance.realm,
            email: instance.email,
            apiKey: instance.apiKey,
          },
          { signal },
        ),
    });
  }, [instances, currentInstanceId, enabled, online, setUnreadCount]);
}

