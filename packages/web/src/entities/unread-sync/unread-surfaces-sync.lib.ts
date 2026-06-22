import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import {
  logSidebarUnreadFlow,
  summarizeSidebarUnreadTotals,
} from "~/shared/lib/sidebar-unread-debug.lib";
import {
  computeInstanceDmUnreadCount,
  computeInstanceUnreadCount,
  hasPersonalUnreadIndicator,
} from "./unread-instance-count.lib";

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
  isStreamMuted?: (streamId: string) => boolean;
  isEffectivelyMuted?: (streamId: string, topic: string) => boolean;
}

// Builds the active org total from the current sidebar model.
function computeCurrentInstanceUnreadTotal(options: {
  isStreamMuted?: (streamId: string) => boolean;
  isEffectivelyMuted?: (streamId: string, topic: string) => boolean;
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
  isStreamMuted?: (streamId: string) => boolean;
  isEffectivelyMuted?: (streamId: string, topic: string) => boolean;
}): void {
  const instances = useInstancesStore.getState();
  instances.setInstanceUnreadCount(
    instanceId,
    computeCurrentInstanceUnreadTotal({ isStreamMuted, isEffectivelyMuted }),
  );
  instances.setInstanceDmUnreadCount(instanceId, computeCurrentPersonalUnreadIndicator());
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
