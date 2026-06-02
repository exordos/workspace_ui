/**
 * Caches register `unread_snapshot` per instance for multi-org badges and refresh debouncing.
 */
import {
  countPersonalDmUnreadFromSnapshot,
  type ZulipUnreadMessagesSnapshot,
} from "~/shared/api/zulip-unread.lib";

const unreadSnapshotByInstanceId = new Map<string, ZulipUnreadMessagesSnapshot>();

export function setCachedRegisterUnreadSnapshot(
  instanceId: string,
  snapshot: ZulipUnreadMessagesSnapshot | undefined,
): void {
  if (snapshot == null) {
    unreadSnapshotByInstanceId.delete(instanceId);
    return;
  }
  unreadSnapshotByInstanceId.set(instanceId, snapshot);
}

export function getCachedRegisterUnreadSnapshot(
  instanceId: string,
): ZulipUnreadMessagesSnapshot | undefined {
  return unreadSnapshotByInstanceId.get(instanceId);
}

export function clearCachedRegisterUnreadSnapshot(instanceId: string): void {
  unreadSnapshotByInstanceId.delete(instanceId);
}

/** Applies org-switcher unread totals from register snapshot (no GET /messages). */
export function applyInstanceUnreadCountsFromRegisterSnapshot(
  instanceId: string,
  snapshot: ZulipUnreadMessagesSnapshot,
  setUnreadCount: (id: string, count: number) => void,
  setDmUnreadCount: (id: string, count: number) => void,
): void {
  setUnreadCount(instanceId, snapshot.totalCount);
  setDmUnreadCount(instanceId, countPersonalDmUnreadFromSnapshot(snapshot) > 0 ? 1 : 0);
}

export function isRegisterUnreadSnapshotUsable(
  snapshot: ZulipUnreadMessagesSnapshot | null | undefined,
): snapshot is ZulipUnreadMessagesSnapshot {
  return snapshot != null && snapshot.oldUnreadsMissing !== true;
}

/** True when register snapshot carries no unread message ids (totalCount may still be 0). */
export function isRegisterUnreadSnapshotEmpty(snapshot: ZulipUnreadMessagesSnapshot): boolean {
  if (snapshot.totalCount > 0) {
    return false;
  }
  for (const bucket of snapshot.streams) {
    if (bucket.unreadMessageIds.length > 0) {
      return false;
    }
  }
  for (const bucket of snapshot.dms) {
    if (bucket.unreadMessageIds.length > 0) {
      return false;
    }
  }
  return true;
}

/**
 * Reconnect reads a cached register snapshot; an empty cache must not wipe sidebar badges
 * rebuilt from IDB + realtime while the queue was offline.
 */
export function shouldPreserveLocalUnreadOnCachedReconcile(
  snapshot: ZulipUnreadMessagesSnapshot,
  localSidebarStreamsUnread: number,
  localSidebarDmsUnread: number,
): boolean {
  return (
    isRegisterUnreadSnapshotEmpty(snapshot) &&
    (localSidebarStreamsUnread > 0 || localSidebarDmsUnread > 0)
  );
}
