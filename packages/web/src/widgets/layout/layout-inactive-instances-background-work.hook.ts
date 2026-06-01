import { useEffect } from "react";
import type { ZulipInstance } from "~/entities/instance/instance.model";
import {
  deleteQueue,
  fetchUnreadDmMessagesCountForCredentials,
  fetchUnreadMessagesCountForCredentials,
} from "~/shared/api/zulip";
import { startZulipEventLoopForCredentials } from "~/shared/lib/event-loop";
import {
  applyInstanceUnreadCountsFromRegisterSnapshot,
  getCachedRegisterUnreadSnapshot,
  isRegisterUnreadSnapshotUsable,
  setCachedRegisterUnreadSnapshot,
} from "./layout-instance-register-unread.lib";
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
        const cached = getCachedRegisterUnreadSnapshot(instance.id);
        if (isRegisterUnreadSnapshotUsable(cached)) {
          applyInstanceUnreadCountsFromRegisterSnapshot(
            instance.id,
            cached,
            setUnreadCount,
            setDmUnreadCount,
          );
          return;
        }
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
      startEventLoop: ({ credentials, onEvent, onBadQueue, onQueueReady, onQueueRegistered }) => {
        const controller = new AbortController();
        let queueId: string | null = null;
        let stopped = false;
        const instance = instances.find(
          (row) => row.realm === credentials.realm && row.email === credentials.email,
        );
        startZulipEventLoopForCredentials({
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
            if (stopped) {
              deleteQueue(id, credentials).catch(() => {});
              return;
            }
            queueId = id;
            if (instance != null && registration?.unread_snapshot != null) {
              setCachedRegisterUnreadSnapshot(instance.id, registration.unread_snapshot);
              if (isRegisterUnreadSnapshotUsable(registration.unread_snapshot)) {
                applyInstanceUnreadCountsFromRegisterSnapshot(
                  instance.id,
                  registration.unread_snapshot,
                  setUnreadCount,
                  setDmUnreadCount,
                );
              }
            }
            onQueueRegistered?.(id, registration);
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
