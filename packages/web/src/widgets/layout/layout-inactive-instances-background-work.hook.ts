import { useEffect } from "react";
import type { ZulipInstance } from "~/entities/instance/instance.model";
import {
  deleteQueue,
  fetchUnreadDmMessagesCountForCredentials,
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
  setDmUnreadCount: (instanceId: string, dmUnreadCount: number) => void;
}): void {
  const { instances, currentInstanceId, enabled, online, setUnreadCount, setDmUnreadCount } =
    options;

  useEffect(() => {
    return startInactiveInstanceEventStreams({
      instances,
      currentInstanceId,
      enabled,
      online,
      refreshUnreadForInstance: async (instance) => {
        const credentials = {
          realm: instance.realm,
          email: instance.email,
          apiKey: instance.apiKey,
        };
        const [unreadCount, dmUnreadCount] = await Promise.all([
          fetchUnreadMessagesCountForCredentials(credentials),
          fetchUnreadDmMessagesCountForCredentials(credentials),
        ]);
        if (unreadCount != null) {
          setUnreadCount(instance.id, unreadCount);
        }
        if (dmUnreadCount != null) {
          setDmUnreadCount(instance.id, dmUnreadCount);
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
  }, [instances, currentInstanceId, enabled, online, setUnreadCount, setDmUnreadCount]);

  useEffect(() => {
    return startInactiveInstanceUnreadPolling({
      instances,
      currentInstanceId,
      enabled,
      online,
      setUnreadCount,
      setDmUnreadCount,
      fetchUnreadCount: (instance, signal) =>
        fetchUnreadMessagesCountForCredentials(
          {
            realm: instance.realm,
            email: instance.email,
            apiKey: instance.apiKey,
          },
          { signal },
        ),
      fetchDmUnreadCount: (instance, signal) =>
        fetchUnreadDmMessagesCountForCredentials(
          {
            realm: instance.realm,
            email: instance.email,
            apiKey: instance.apiKey,
          },
          { signal },
        ),
    });
  }, [instances, currentInstanceId, enabled, online, setUnreadCount, setDmUnreadCount]);
}
