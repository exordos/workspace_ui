import type { ZulipInstance } from "~/entities/instance/instance.model";
import { syncUnreadSurfacesFromSnapshot } from "~/entities/unread-sync/unread-surfaces-sync.lib";
import { deleteQueue } from "~/shared/api/zulip-queue";
import type { RegisterQueueResult, ZulipCredentials } from "~/shared/api/zulip.types";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import {
  isRegisterUnreadSnapshotUsable,
  setCachedRegisterUnreadSnapshot,
} from "./layout-instance-register-unread.lib";

export interface InactiveInstanceQueueRegistration {
  queueId: string;
  registration: RegisterQueueResult | null | undefined;
}

export function handleInactiveInstanceQueueRegistered(
  params: InactiveInstanceQueueRegistration & {
    stopped: boolean;
    credentials: ZulipCredentials;
    instance: ZulipInstance | undefined;
    onQueueRegistered?: (id: string, registration?: RegisterQueueResult) => void;
  },
): string | null {
  const { queueId, registration, stopped, credentials, instance, onQueueRegistered } = params;
  if (stopped) {
    void deleteQueue(queueId, credentials).catch((err) =>
      reportUnexpectedError("layout:inactiveQueue", err, { phase: "stoppedCleanup", queueId }),
    );
    return null;
  }
  if (instance != null && registration?.unread_snapshot != null) {
    setCachedRegisterUnreadSnapshot(instance.id, registration.unread_snapshot);
    if (isRegisterUnreadSnapshotUsable(registration.unread_snapshot)) {
      syncUnreadSurfacesFromSnapshot({
        source: "inactive-register",
        instanceId: instance.id,
        currentUserId: null,
        snapshot: registration.unread_snapshot,
        applyChatList: false,
        applyInstanceCounts: true,
      });
    }
  }
  onQueueRegistered?.(queueId, registration ?? undefined);
  return queueId;
}

export function abortInactiveInstanceQueueOnTeardown(
  queueId: string | null,
  credentials: ZulipCredentials,
  controller: AbortController,
): void {
  if (queueId != null) {
    void deleteQueue(queueId, credentials).catch((err) =>
      reportUnexpectedError("layout:inactiveQueue", err, { phase: "teardown", queueId }),
    );
  }
  controller.abort();
}
