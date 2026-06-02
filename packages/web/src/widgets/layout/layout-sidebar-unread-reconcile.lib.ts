/**
 * Sidebar unread reconcile after bootstrap — register `unread_msgs` is authoritative in metadata-first.
 */
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { ZulipUnreadMessagesSnapshot } from "~/shared/api/zulip-unread.lib";
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";
import {
  logSidebarUnreadFlow,
  summarizeRegisterUnreadSnapshot,
} from "~/shared/lib/sidebar-unread-debug.lib";
import {
  isRegisterUnreadSnapshotUsable,
  shouldPreserveLocalUnreadOnCachedReconcile,
} from "./layout-instance-register-unread.lib";

export type SidebarUnreadReconcileSkippedReason =
  | "register_unread_unavailable"
  | "empty_cached_snapshot_preserves_local_unread";

export type SidebarUnreadReconcileSnapshotSource = "fresh-register" | "cached-register";

export interface ReconcileSidebarUnreadAfterBootstrapOptions {
  cancelled: () => boolean;
  currentUserId: number | null;
  registerSnapshot?: ZulipUnreadMessagesSnapshot | null;
  logScope?: string;
  /**
   * `cached-register` — tab resume / light reconnect (do not apply empty snapshot over local badges).
   * `fresh-register` — queue register or bootstrap (server snapshot is authoritative).
   */
  snapshotSource?: SidebarUnreadReconcileSnapshotSource;
}

/**
 * Applies register unread snapshot when usable. In metadata-first, never falls back to
 * `reconcileUnreadFromMessages` on GET /messages (5000 cap would under-count 100k+ unread).
 */
export function reconcileSidebarUnreadAfterBootstrap(
  options: ReconcileSidebarUnreadAfterBootstrapOptions,
): void {
  const snapshot = options.registerSnapshot;
  const logScope = options.logScope ?? "sidebarUnread";
  const snapshotSource = options.snapshotSource ?? "fresh-register";

  if (isRegisterUnreadSnapshotUsable(snapshot)) {
    if (options.cancelled()) return;

    const chatListState = useChatListStore.getState();
    if (
      snapshotSource === "cached-register" &&
      shouldPreserveLocalUnreadOnCachedReconcile(
        snapshot,
        chatListState.sidebarStreamsUnread,
        chatListState.sidebarDmsUnread,
      )
    ) {
      logSidebarUnreadFlow(`bootstrap:${logScope}:skipped`, {
        skippedReason:
          "empty_cached_snapshot_preserves_local_unread" satisfies SidebarUnreadReconcileSkippedReason,
        snapshotSource,
        ...summarizeRegisterUnreadSnapshot(snapshot),
        totalsLocal: {
          sidebarStreamsUnread: chatListState.sidebarStreamsUnread,
          sidebarDmsUnread: chatListState.sidebarDmsUnread,
        },
      });
      logChatListFlow(`${logScope}: reconcile skipped (empty cached snapshot, local unread)`, {
        skippedReason: "empty_cached_snapshot_preserves_local_unread",
        totalCount: snapshot.totalCount,
      });
      return;
    }

    logChatListFlow(`${logScope}: reconcileUnreadFromSnapshot`, {
      streamBuckets: snapshot.streams.length,
      dmBuckets: snapshot.dms.length,
      totalCount: snapshot.totalCount,
    });
    logSidebarUnreadFlow(`bootstrap:${logScope}:registerSnapshot`, {
      currentUserId: options.currentUserId,
      snapshotSource,
      ...summarizeRegisterUnreadSnapshot(snapshot),
    });
    useChatListStore.getState().reconcileUnreadFromSnapshot(snapshot, options.currentUserId);
    return;
  }

  logSidebarUnreadFlow(`bootstrap:${logScope}:skipped`, {
    skippedReason: "register_unread_unavailable" satisfies SidebarUnreadReconcileSkippedReason,
    oldUnreadsMissing: options.registerSnapshot?.oldUnreadsMissing === true ? true : null,
  });
  logChatListFlow(`${logScope}: reconcile skipped (metadata-first)`, {
    skippedReason: "register_unread_unavailable" satisfies SidebarUnreadReconcileSkippedReason,
    oldUnreadsMissing: options.registerSnapshot?.oldUnreadsMissing === true ? true : null,
  });
}
