import { useEffect } from "react";
import type { ZulipInstance } from "~/entities/instance/instance.model";
import {
  fetchUnreadDmMessagesCountForCredentials,
  fetchUnreadMessagesCountForCredentials,
} from "~/shared/api/zulip-queue";
import { startZulipEventLoopForCredentials } from "~/shared/lib/event-loop";
import {
  abortInactiveInstanceQueueOnTeardown,
  handleInactiveInstanceQueueRegistered,
} from "./layout-inactive-instance-queue.lib";
import {
  applyInstanceUnreadCountsFromRegisterSnapshot,
  getCachedRegisterUnreadSnapshot,
  isRegisterUnreadSnapshotUsable,
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
            const nextQueueId = handleInactiveInstanceQueueRegistered({
              queueId: id,
              registration,
              stopped,
              credentials,
              instance,
              setUnreadCount,
              setDmUnreadCount,
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
