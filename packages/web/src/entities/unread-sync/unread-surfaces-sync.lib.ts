import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import {
  logSidebarUnreadFlow,
  summarizeSidebarUnreadTotals,
} from "~/shared/lib/sidebar-unread-debug.lib";

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

// Applies a local/event change. Unread counters are server-owned and must not be recomputed here.
export function syncUnreadSurfacesFromDelta({
  source,
  instanceId,
  applyDelta,
  applyInstanceCounts: _applyInstanceCounts = true,
  isStreamMuted: _isStreamMuted,
  isEffectivelyMuted: _isEffectivelyMuted,
}: SyncUnreadSurfacesFromDeltaOptions): void {
  const chatListBefore = useChatListStore.getState();
  const instancesBefore = useInstancesStore.getState();

  logSidebarUnreadFlow("syncUnreadSurfaces:eventDelta:start", {
    source,
    instanceId,
    applyInstanceCounts: false,
    sidebarBefore: summarizeSidebarUnreadTotals(chatListBefore),
    instanceUnreadBefore:
      instanceId != null ? instancesBefore.getInstanceUnreadCount(instanceId) : null,
    instanceDmUnreadBefore:
      instanceId != null ? instancesBefore.getInstanceDmUnreadCount(instanceId) : null,
  });

  applyDelta();

  const chatListAfter = useChatListStore.getState();

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
