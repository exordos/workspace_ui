import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import {
  countMentionsUnreadFromSnapshot,
  countPersonalDmUnreadFromSnapshot,
  type ZulipUnreadMessagesSnapshot,
} from "~/shared/api/zulip-unread.lib";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import {
  logSidebarUnreadFlow,
  summarizeSidebarUnreadTotals,
} from "~/shared/lib/sidebar-unread-debug.lib";
import {
  computeInstanceDmUnreadCount,
  computeInstanceUnreadCount,
  hasPersonalUnreadIndicator,
} from "./unread-instance-count.lib";

// Full unread snapshots come from register, reconnect, inactive org refresh, or Inbox.
export type UnreadSurfaceSyncSource =
  | "event-loop-register"
  | "reconnect"
  | "reconnect-light"
  | "inactive-register"
  | "inactive-cached-register"
  | "inbox-fetch";

export interface SyncUnreadSurfacesFromSnapshotOptions {
  source: UnreadSurfaceSyncSource;
  instanceId: string | null;
  currentUserId: number | null;
  snapshot: ZulipUnreadMessagesSnapshot;
  messages?: readonly ZulipRawMessage[];
  applyChatList?: boolean;
  applyInstanceCounts?: boolean;
  // Active org should use chat-list-derived, so muted topics do not raise the org badge.
  instanceCountMode?: "snapshot-total" | "chat-list-derived";
  isStreamMuted?: (streamId: number) => boolean;
  isEffectivelyMuted?: (streamId: number, topic: string) => boolean;
}

// Small unread changes come from live events or local optimistic actions.
export type UnreadDeltaSyncSource =
  | "event-message"
  | "event-read-add"
  | "event-read-remove"
  | "event-mark-all-read"
  | "local-chat-read"
  | "local-chat-read-rollback"
  | "local-chat-mark-all-read"
  | "local-sidebar-mark-read"
  | "layout-derived";

export type UnreadEventDeltaSyncSource = Extract<
  UnreadDeltaSyncSource,
  "event-message" | "event-read-add" | "event-read-remove" | "event-mark-all-read"
>;

export interface SyncUnreadSurfacesFromDeltaOptions {
  source: UnreadDeltaSyncSource;
  instanceId: string | null;
  applyDelta: () => void;
  applyInstanceCounts?: boolean;
  isStreamMuted?: (streamId: number) => boolean;
  isEffectivelyMuted?: (streamId: number, topic: string) => boolean;
}

function hasPersonalUnreadFromSnapshot(snapshot: ZulipUnreadMessagesSnapshot): boolean {
  return (
    countPersonalDmUnreadFromSnapshot(snapshot) > 0 || countMentionsUnreadFromSnapshot(snapshot) > 0
  );
}

// Used for inactive orgs where we only trust the server total.
function writeInstanceCountsFromSnapshot(
  instanceId: string,
  snapshot: ZulipUnreadMessagesSnapshot,
): void {
  const instances = useInstancesStore.getState();
  instances.setInstanceUnreadCount(instanceId, snapshot.totalCount);
  instances.setInstanceDmUnreadCount(instanceId, hasPersonalUnreadFromSnapshot(snapshot) ? 1 : 0);
}

// Builds the active org total from the current sidebar model.
function computeCurrentInstanceUnreadTotal(options: {
  isStreamMuted?: (streamId: number) => boolean;
  isEffectivelyMuted?: (streamId: number, topic: string) => boolean;
}): number {
  const chatList = useChatListStore.getState();
  return computeInstanceUnreadCount({
    streams: chatList.streams(),
    dms: chatList.dms(),
    isStreamMuted: options.isStreamMuted,
    isEffectivelyMuted: options.isEffectivelyMuted,
  });
}

// The org dot is shown for personal DMs or mentions.
function computeCurrentPersonalUnreadIndicator(): number {
  const chatList = useChatListStore.getState();
  const personalDmUnread = computeInstanceDmUnreadCount({
    dms: chatList.dms(),
    currentUserId: chatList.currentUserId,
  });
  return hasPersonalUnreadIndicator(personalDmUnread, chatList.mentionsUnreadCount) ? 1 : 0;
}

// Main writer for the active org badge.
function writeInstanceCountsFromCurrentChatList({
  instanceId,
  isStreamMuted,
  isEffectivelyMuted,
}: {
  instanceId: string;
  isStreamMuted?: (streamId: number) => boolean;
  isEffectivelyMuted?: (streamId: number, topic: string) => boolean;
}): void {
  const instances = useInstancesStore.getState();
  instances.setInstanceUnreadCount(
    instanceId,
    computeCurrentInstanceUnreadTotal({ isStreamMuted, isEffectivelyMuted }),
  );
  instances.setInstanceDmUnreadCount(instanceId, computeCurrentPersonalUnreadIndicator());
}

// Applies a server snapshot, then updates the requested unread surfaces.
export function syncUnreadSurfacesFromSnapshot({
  source,
  instanceId,
  currentUserId,
  snapshot,
  messages,
  applyChatList = true,
  applyInstanceCounts = true,
  instanceCountMode = "snapshot-total",
  isStreamMuted,
  isEffectivelyMuted,
}: SyncUnreadSurfacesFromSnapshotOptions): void {
  const chatListBefore = useChatListStore.getState();
  const instancesBefore = useInstancesStore.getState();
  const instanceUnreadBefore =
    instanceId != null ? instancesBefore.getInstanceUnreadCount(instanceId) : null;
  const instanceDmUnreadBefore =
    instanceId != null ? instancesBefore.getInstanceDmUnreadCount(instanceId) : null;

  logSidebarUnreadFlow("syncUnreadSurfaces:start", {
    source,
    instanceId,
    currentUserId,
    snapshotTotal: snapshot.totalCount,
    streamBuckets: snapshot.streams.length,
    dmBuckets: snapshot.dms.length,
    messageCount: messages?.length ?? null,
    applyChatList,
    applyInstanceCounts,
    sidebarBefore: summarizeSidebarUnreadTotals(chatListBefore),
    instanceUnreadBefore,
    instanceDmUnreadBefore,
  });

  if (applyChatList) {
    if (messages != null) {
      useChatListStore.getState().reconcileUnreadFromMessages([...messages], currentUserId);
    } else {
      useChatListStore.getState().reconcileUnreadFromSnapshot(snapshot, currentUserId);
    }
  }

  if (applyInstanceCounts && instanceId != null) {
    // Active org uses the current chat-list; inactive orgs keep the raw snapshot total.
    if (instanceCountMode === "chat-list-derived") {
      writeInstanceCountsFromCurrentChatList({ instanceId, isStreamMuted, isEffectivelyMuted });
    } else {
      writeInstanceCountsFromSnapshot(instanceId, snapshot);
    }
  }

  const chatListAfter = useChatListStore.getState();
  const instancesAfter = useInstancesStore.getState();
  logSidebarUnreadFlow("syncUnreadSurfaces:done", {
    source,
    instanceId,
    sidebarAfter: summarizeSidebarUnreadTotals(chatListAfter),
    instanceUnreadAfter:
      instanceId != null ? instancesAfter.getInstanceUnreadCount(instanceId) : null,
    instanceDmUnreadAfter:
      instanceId != null ? instancesAfter.getInstanceDmUnreadCount(instanceId) : null,
  });
}

// Applies a local/event change, then recalculates the active org badge.
export function syncUnreadSurfacesFromDelta({
  source,
  instanceId,
  applyDelta,
  applyInstanceCounts = true,
  isStreamMuted,
  isEffectivelyMuted,
}: SyncUnreadSurfacesFromDeltaOptions): void {
  const chatListBefore = useChatListStore.getState();
  const instancesBefore = useInstancesStore.getState();

  logSidebarUnreadFlow("syncUnreadSurfaces:eventDelta:start", {
    source,
    instanceId,
    applyInstanceCounts,
    sidebarBefore: summarizeSidebarUnreadTotals(chatListBefore),
    instanceUnreadBefore:
      instanceId != null ? instancesBefore.getInstanceUnreadCount(instanceId) : null,
    instanceDmUnreadBefore:
      instanceId != null ? instancesBefore.getInstanceDmUnreadCount(instanceId) : null,
  });

  applyDelta();

  const chatListAfter = useChatListStore.getState();
  if (applyInstanceCounts && instanceId != null) {
    writeInstanceCountsFromCurrentChatList({ instanceId, isStreamMuted, isEffectivelyMuted });
  }

  const instancesAfter = useInstancesStore.getState();
  logSidebarUnreadFlow("syncUnreadSurfaces:eventDelta:done", {
    source,
    instanceId,
    sidebarAfter: summarizeSidebarUnreadTotals(chatListAfter),
    instanceUnreadAfter:
      instanceId != null ? instancesAfter.getInstanceUnreadCount(instanceId) : null,
    instanceDmUnreadAfter:
      instanceId != null ? instancesAfter.getInstanceDmUnreadCount(instanceId) : null,
  });
}

// Keeps the old event-specific name while using the shared delta path.
export function syncUnreadSurfacesFromEventDelta(
  options: SyncUnreadSurfacesFromDeltaOptions,
): void {
  syncUnreadSurfacesFromDelta(options);
}
