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
} from "./layout-instance-unread.lib";

export type LayoutUnreadSurfaceSyncSource =
  | "event-loop-register"
  | "reconnect"
  | "reconnect-light"
  | "inactive-register"
  | "inactive-cached-register"
  | "inbox-fetch";

export interface SyncUnreadSurfacesFromSnapshotOptions {
  source: LayoutUnreadSurfaceSyncSource;
  instanceId: string | null;
  currentUserId: number | null;
  snapshot: ZulipUnreadMessagesSnapshot;
  messages?: readonly ZulipRawMessage[];
  applyChatList?: boolean;
  applyInstanceCounts?: boolean;
}

export type LayoutUnreadEventDeltaSyncSource =
  | "event-message"
  | "event-read-add"
  | "event-read-remove"
  | "event-mark-all-read";

export interface SyncUnreadSurfacesFromEventDeltaOptions {
  source: LayoutUnreadEventDeltaSyncSource;
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

export function syncUnreadSurfacesFromSnapshot({
  source,
  instanceId,
  currentUserId,
  snapshot,
  messages,
  applyChatList = true,
  applyInstanceCounts = true,
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
    const instances = useInstancesStore.getState();
    instances.setInstanceUnreadCount(instanceId, snapshot.totalCount);
    instances.setInstanceDmUnreadCount(instanceId, hasPersonalUnreadFromSnapshot(snapshot) ? 1 : 0);
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

function computeCurrentPersonalUnreadIndicator(): number {
  const chatList = useChatListStore.getState();
  const personalDmUnread = computeInstanceDmUnreadCount({
    dms: chatList.dms(),
    currentUserId: chatList.currentUserId,
  });
  return hasPersonalUnreadIndicator(personalDmUnread, chatList.mentionsUnreadCount) ? 1 : 0;
}

export function syncUnreadSurfacesFromEventDelta({
  source,
  instanceId,
  applyDelta,
  applyInstanceCounts = true,
  isStreamMuted,
  isEffectivelyMuted,
}: SyncUnreadSurfacesFromEventDeltaOptions): void {
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
    const instances = useInstancesStore.getState();
    instances.setInstanceUnreadCount(
      instanceId,
      computeCurrentInstanceUnreadTotal({ isStreamMuted, isEffectivelyMuted }),
    );
    instances.setInstanceDmUnreadCount(instanceId, computeCurrentPersonalUnreadIndicator());
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
