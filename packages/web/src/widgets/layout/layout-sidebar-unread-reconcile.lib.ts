/**
 * Sidebar unread reconcile after bootstrap — register `unread_msgs` is authoritative in metadata-first.
 */
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { ZulipUnreadMessagesSnapshot } from "~/shared/api/zulip-unread.lib";
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";
import { isRegisterUnreadSnapshotUsable } from "./layout-instance-register-unread.lib";

export type SidebarUnreadReconcileSkippedReason = "register_unread_unavailable";

export interface ReconcileSidebarUnreadAfterBootstrapOptions {
  cancelled: () => boolean;
  currentUserId: number | null;
  registerSnapshot?: ZulipUnreadMessagesSnapshot | null;
  logScope?: string;
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

  if (isRegisterUnreadSnapshotUsable(snapshot)) {
    if (options.cancelled()) return;
    logChatListFlow(`${logScope}: reconcileUnreadFromSnapshot`, {
      streamBuckets: snapshot.streams.length,
      dmBuckets: snapshot.dms.length,
      totalCount: snapshot.totalCount,
    });
    useChatListStore.getState().reconcileUnreadFromSnapshot(snapshot, options.currentUserId);
    return;
  }

  logChatListFlow(`${logScope}: reconcile skipped (metadata-first)`, {
    skippedReason: "register_unread_unavailable" satisfies SidebarUnreadReconcileSkippedReason,
    oldUnreadsMissing: options.registerSnapshot?.oldUnreadsMissing === true ? true : null,
  });
}
