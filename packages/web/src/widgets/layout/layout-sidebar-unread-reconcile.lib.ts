/**
 * Sidebar unread reconcile after bootstrap — register `unread_msgs` is authoritative in metadata-first.
 */
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import {
  syncUnreadSurfacesFromSnapshot,
  type UnreadSurfaceSyncSource,
} from "~/entities/unread-sync/unread-surfaces-sync.lib";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
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
const lastReconciledSnapshotKeyByInstanceId = new Map<string, string>();

function buildUnreadSnapshotDedupeKey(snapshot: ZulipUnreadMessagesSnapshot): string {
  const streamPart = snapshot.streams
    .map(
      (bucket) => `${bucket.streamId}:${bucket.topic}:${(bucket.unreadMessageIds ?? []).join(",")}`,
    )
    .join("|");
  const dmPart = snapshot.dms
    .map(
      (bucket) =>
        `${(bucket.userIds ?? []).join("+")}:${(bucket.unreadMessageIds ?? []).join(",")}`,
    )
    .join("|");
  return `${snapshot.totalCount}::${streamPart}::${dmPart}::${(snapshot.mentionMessageIds ?? []).join(",")}`;
}

/** Clears dedupe guard (e.g. after logout or instance switch). */
export function resetSidebarUnreadReconcileDedupe(): void {
  lastReconciledSnapshotKeyByInstanceId.clear();
}

export type SidebarUnreadReconcileSkippedReason =
  | "register_unread_unavailable"
  | "empty_cached_snapshot_preserves_local_unread";

export type SidebarUnreadReconcileSnapshotSource = "fresh-register" | "cached-register";

export interface ReconcileSidebarUnreadAfterBootstrapOptions {
  cancelled: () => boolean;
  instanceId?: string | null;
  currentUserId: number | null;
  registerSnapshot?: ZulipUnreadMessagesSnapshot | null;
  logScope?: string;
  /**
   * `cached-register` — tab resume / light reconnect (do not apply empty snapshot over local badges).
   * `fresh-register` — queue register or bootstrap (server snapshot is authoritative).
   */
  snapshotSource?: SidebarUnreadReconcileSnapshotSource;
  syncSource?: UnreadSurfaceSyncSource;
  instanceCountMode?: "snapshot-total" | "chat-list-derived";
}

function dedupeScopeKey(instanceId: string | null | undefined): string {
  return instanceId ?? "active:null";
}

function resolveSyncSource(
  snapshotSource: SidebarUnreadReconcileSnapshotSource,
): UnreadSurfaceSyncSource {
  return snapshotSource === "cached-register" ? "reconnect-light" : "event-loop-register";
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
        chatListState.messageIdToLocation.size,
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

    const dedupeKey = buildUnreadSnapshotDedupeKey(snapshot);
    const scopedDedupeKey = dedupeScopeKey(options.instanceId);
    if (dedupeKey === lastReconciledSnapshotKeyByInstanceId.get(scopedDedupeKey)) {
      logSidebarUnreadFlow(`bootstrap:${logScope}:skipped`, {
        skippedReason: "duplicate_register_snapshot",
        instanceId: options.instanceId ?? null,
        snapshotSource,
      });
      logChatListFlow(`${logScope}: reconcile skipped (duplicate snapshot)`, { snapshotSource });
      return;
    }
    lastReconciledSnapshotKeyByInstanceId.set(scopedDedupeKey, dedupeKey);

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
    // Active org uses derived count; inactive callers can force snapshot-total.
    const instanceCountMode = options.instanceCountMode ?? "chat-list-derived";
    const mute = instanceCountMode === "chat-list-derived" ? useMuteStore.getState() : null;
    syncUnreadSurfacesFromSnapshot({
      source: options.syncSource ?? resolveSyncSource(snapshotSource),
      instanceId: options.instanceId ?? null,
      currentUserId: options.currentUserId,
      snapshot,
      applyChatList: true,
      applyInstanceCounts: options.instanceId != null,
      instanceCountMode,
      isStreamMuted: mute?.isStreamMuted,
      isEffectivelyMuted: mute?.isEffectivelyMuted,
    });
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
