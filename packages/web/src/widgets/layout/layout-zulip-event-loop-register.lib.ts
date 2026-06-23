import { useActivityStore } from "~/entities/activity/activity.model";
import {
  summarizeRecentPrivateConversationsForTrace,
  traceDmPreviewHydrate,
} from "~/entities/chat-list/chat-list-dm-preview-hydrate-trace.lib";
import { queuePriorityStreamSidebarTopicsHydrate } from "~/entities/chat-list/chat-list-hydrate-stream-sidebar.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type {
  ChatListDmMetadataRow,
  ChatListStreamMetadataRow,
} from "~/entities/chat-list/chat-list.model.types";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useNotificationSettingsStore } from "~/entities/notification-settings/notification-settings.model";
import { applyUserStatusSnapshot } from "~/entities/user/api/user-status-write.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { useUserGroupsStore } from "~/entities/user-group/user-group.model";
import type { ZulipUnreadMessagesSnapshot } from "~/shared/api/zulip-unread.lib";
import type {
  RegisterQueueResult,
  ZulipRecentPrivateConversation,
  ZulipSubscription,
} from "~/shared/api/zulip.types";
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { setCachedRegisterUnreadSnapshot } from "./layout-instance-register-unread.lib";
import {
  flushReconnectStreamPreviewsAfterRegister,
  markReconnectStreamPreviewRegisterReady,
} from "./layout-reconnect-stream-preview.lib";
import { createRegisterMuteSnapshotAppliedMarker } from "./layout-zulip-event-loop-bootstrap.lib";
import type { ChatListBootstrapResult } from "./layout-chat-list-bootstrap.lib";
import type { LayoutMuteBootstrapData, LayoutMuteSnapshot } from "./layout-instance-bootstrap.hook";

type RegisterApplySkipReason = "aborted" | "stale_epoch" | "stale_callback";

interface RegisterApplyGuardOutcome {
  ok: boolean;
  reason?: RegisterApplySkipReason;
}

function logRegisterApplySkip(options: {
  currentInstanceId: string | null;
  queueId: string;
  reason: RegisterApplySkipReason;
}): void {
  logChatListFlow("eventLoop: skip stale register apply", {
    instanceId: options.currentInstanceId,
    queueId: options.queueId,
    reason: options.reason,
    activeInstanceId: useInstancesStore.getState().currentInstanceId,
  });
}

export function toStreamMetadataRows(
  subscriptions: readonly ZulipSubscription[],
): ChatListStreamMetadataRow[] {
  return subscriptions
    .filter(
      (subscription): subscription is ZulipSubscription =>
        Number.isInteger(subscription.stream_id) &&
        subscription.stream_id > 0 &&
        subscription.name.trim().length > 0,
    )
    .map((subscription) => {
      const creatorId =
        typeof subscription.creator_id === "number" &&
        Number.isInteger(subscription.creator_id) &&
        subscription.creator_id > 0
          ? subscription.creator_id
          : undefined;
      return {
        streamId: subscription.stream_id,
        name: subscription.name,
        ...(typeof subscription.is_archived === "boolean"
          ? { isArchived: subscription.is_archived }
          : {}),
        ...(creatorId != null ? { creatorId } : {}),
        ...(typeof subscription.invite_only === "boolean"
          ? { inviteOnly: subscription.invite_only }
          : {}),
        ...(subscription.can_add_subscribers_group != null
          ? { canAddSubscribersGroup: subscription.can_add_subscribers_group }
          : {}),
        ...(subscription.can_remove_subscribers_group != null
          ? { canRemoveSubscribersGroup: subscription.can_remove_subscribers_group }
          : {}),
        ...(subscription.can_administer_channel_group != null
          ? { canAdministerChannelGroup: subscription.can_administer_channel_group }
          : {}),
        ...(subscription.can_resolve_topics_group != null
          ? { canResolveTopicsGroup: subscription.can_resolve_topics_group }
          : {}),
        ...(subscription.can_move_messages_out_of_channel_group != null
          ? {
              canMoveMessagesOutOfChannelGroup: subscription.can_move_messages_out_of_channel_group,
            }
          : {}),
      };
    });
}

export function toDmMetadataRowsFromRecentConversations(
  conversations: Record<string, ZulipRecentPrivateConversation> | undefined,
): ChatListDmMetadataRow[] {
  if (conversations == null) {
    return [];
  }
  const rows: ChatListDmMetadataRow[] = [];
  for (const conversation of Object.values(conversations)) {
    if (!Array.isArray(conversation.user_ids) || conversation.user_ids.length === 0) {
      continue;
    }
    rows.push({
      userIds: conversation.user_ids,
      lastMessageId: conversation.max_message_id ?? null,
      unreadCount: conversation.unread_message_ids?.length ?? 0,
    });
  }
  return rows;
}

function streamMetadataRowMissingInChatList(
  streamsMap: ReadonlyMap<number, unknown>,
  row: ChatListStreamMetadataRow,
): boolean {
  return !streamsMap.has(row.streamId);
}

function applyReconnectStreamPreviewBootstrap(
  streamResult: ChatListBootstrapResult,
  applyOptions: unknown,
  applyChatListBootstrapResult: (result: ChatListBootstrapResult, applyOptions: unknown) => void,
): void {
  applyChatListBootstrapResult(streamResult, applyOptions);
}

function applyRegisterUserStatusSnapshot(
  snapshot: RegisterQueueResult["userStatusSnapshot"],
): void {
  if (snapshot === undefined) {
    return;
  }

  const fetchedAt = Date.now();
  const snapshotUserIds = new Set<number>();

  for (const entry of snapshot) {
    if (useUsersStore.getState().getUser(entry.userId) == null) {
      continue;
    }
    snapshotUserIds.add(entry.userId);
    applyUserStatusSnapshot(entry.userId, entry.status, fetchedAt);
  }

  for (const user of useUsersStore.getState().users.values()) {
    if (user.status == null || snapshotUserIds.has(user.user_id)) {
      continue;
    }
    applyUserStatusSnapshot(user.user_id, null, fetchedAt);
  }
}

export interface LayoutBootstrapQueueRegisteredDeps {
  getRegisterApplyGuard: () => RegisterApplyGuardOutcome;
  isCancelled: () => boolean;
  currentInstanceId: string | null;
  bootstrapUserId: number | null;
  metadataDmPreviewHydrationEnabled: boolean;
  queueIdRef: { current: string | null };
  registerUnreadSnapshotRef: { current: ZulipUnreadMessagesSnapshot | null };
  persistDmIndexFromStore: (instanceId: string) => void;
  reconcileSidebarUnreadFromRegister: (
    instanceId: string | null,
    registration: RegisterQueueResult | undefined,
    currentUserId: number | null,
  ) => void;
  streamPreviewCoordinator: { markRegisterHydrationReady: () => void };
  tryFlushMetadataStreamPreviews: () => void;
  applyChatListBootstrapResult: (result: ChatListBootstrapResult, applyOptions: unknown) => void;
  scheduleDmPreviewHydration: (
    conversations?: Record<string, ZulipRecentPrivateConversation>,
    currentUserIdOverride?: number | null,
    metadataRows?: ChatListDmMetadataRow[],
    source?: string,
  ) => void;
  startSidebarUnreadReconcile: (params: {
    cancelled: () => boolean;
    instanceId: string | null;
    currentUserId: number | null;
    registerSnapshot: ZulipUnreadMessagesSnapshot | null;
  }) => void;
  loadMuteSnapshot: (bootstrap?: LayoutMuteBootstrapData) => Promise<LayoutMuteSnapshot>;
  applyLayoutRegisterMuteSnapshot: (options: {
    cancelled: boolean;
    currentInstanceId: string | null;
    snapshot: LayoutMuteSnapshot;
    markRegisterMuteSnapshotApplied: () => void;
  }) => void;
  registerMuteSnapshotAppliedRef: { registerMuteSnapshotApplied: boolean };
}

export function createLayoutBootstrapQueueRegisteredHandler(
  deps: LayoutBootstrapQueueRegisteredDeps,
): (id: string, registration: RegisterQueueResult | undefined) => void {
  return function handleLayoutBootstrapQueueRegistered(id, registration): void {
    const applyGuard = deps.getRegisterApplyGuard();
    if (!applyGuard.ok) {
      logRegisterApplySkip({
        currentInstanceId: deps.currentInstanceId,
        queueId: id,
        reason: applyGuard.reason ?? "stale_callback",
      });
      traceDmPreviewHydrate("register:skip", {
        queueId: id,
        reason: applyGuard.reason ?? "stale_callback",
        instanceId: deps.currentInstanceId,
      });
      return;
    }

    traceDmPreviewHydrate("register:onQueueRegistered", {
      queueId: id,
      metadataDmPreviewHydrationEnabled: deps.metadataDmPreviewHydrationEnabled,
      conversations: summarizeRecentPrivateConversationsForTrace(
        registration?.recent_private_conversations,
      ),
      storeCurrentUserId: useChatListStore.getState().currentUserId,
      bootstrapUserId: deps.bootstrapUserId,
    });

    deps.queueIdRef.current = id;
    deps.registerUnreadSnapshotRef.current = registration?.unread_snapshot ?? null;
    if (deps.currentInstanceId != null && registration?.unread_snapshot != null) {
      setCachedRegisterUnreadSnapshot(deps.currentInstanceId, registration.unread_snapshot);
    }
    if (registration?.jitsi_server_url_effective != null) {
      useInstancesStore.getState().setJitsiMeetBaseUrl(registration.jitsi_server_url_effective);
    } else {
      useInstancesStore.getState().setJitsiMeetBaseUrl(null);
    }
    if (registration?.starred_message_ids != null) {
      useActivityStore
        .getState()
        .setStarredSummaryFromRegisterMessageIds(registration.starred_message_ids);
    }
    useUsersStore.getState().setCurrentUserChannelCapabilities({
      ...(registration?.realm_can_add_subscribers_group != null
        ? {
            realmCanAddSubscribersGroup: registration.realm_can_add_subscribers_group,
          }
        : {}),
      ...(registration?.realm_can_resolve_topics_group != null
        ? {
            realmCanResolveTopicsGroup: registration.realm_can_resolve_topics_group,
          }
        : {}),
      ...(registration?.realm_can_move_messages_between_channels_group != null
        ? {
            realmCanMoveMessagesBetweenChannelsGroup:
              registration.realm_can_move_messages_between_channels_group,
          }
        : {}),
    });
    useUsersStore.getState().setCurrentUserMessageEditPolicy({
      ...(registration?.realm_allow_message_editing != null
        ? { allowMessageEditing: registration.realm_allow_message_editing }
        : {}),
      ...(registration?.realm_message_content_edit_limit_seconds !== undefined
        ? {
            messageContentEditLimitSeconds: registration.realm_message_content_edit_limit_seconds,
          }
        : {}),
    });
    useUserGroupsStore.getState().setGroups(registration?.realm_user_groups ?? []);
    const streamRows = toStreamMetadataRows(registration?.subscriptions ?? []);
    const chatListState = useChatListStore.getState();
    if (streamRows.length > 0) {
      const hasMissingStream = streamRows.some((row) =>
        streamMetadataRowMissingInChatList(chatListState.streamsMap, row),
      );
      if (!chatListState.streamMetadataHydrated || hasMissingStream) {
        useChatListStore.getState().upsertStreamMetadataRows(streamRows);
      } else {
        logChatListFlow("eventLoop: registerQueue → skip duplicate stream metadata upsert", {
          rowCount: streamRows.length,
        });
      }
    }
    useChatListStore.getState().setStreamMetadataHydrated(true);
    if (registration?.user_settings != null) {
      useNotificationSettingsStore.getState().setFromServer(registration.user_settings);
    }
    applyRegisterUserStatusSnapshot(registration?.userStatusSnapshot);
    const conversations = registration?.recent_private_conversations;
    const rows = toDmMetadataRowsFromRecentConversations(conversations);
    if (rows.length > 0) {
      logChatListFlow(
        "eventLoop: registerQueue → upsertDmMetadataRows from recent_private_conversations",
        {
          rowCount: rows.length,
        },
      );
      useChatListStore.getState().upsertDmMetadataRows(rows);
      if (deps.currentInstanceId != null) {
        deps.persistDmIndexFromStore(deps.currentInstanceId);
      }
    }
    deps.streamPreviewCoordinator.markRegisterHydrationReady();
    markReconnectStreamPreviewRegisterReady();
    deps.tryFlushMetadataStreamPreviews();
    flushReconnectStreamPreviewsAfterRegister((streamResult, applyOptions) => {
      applyReconnectStreamPreviewBootstrap(
        streamResult,
        applyOptions,
        deps.applyChatListBootstrapResult,
      );
    });
    queuePriorityStreamSidebarTopicsHydrate(registration?.unread_snapshot);
    deps.scheduleDmPreviewHydration(
      conversations,
      useChatListStore.getState().currentUserId ?? deps.bootstrapUserId,
      rows,
      "onQueueRegistered",
    );
    deps.startSidebarUnreadReconcile({
      cancelled: deps.isCancelled,
      instanceId: deps.currentInstanceId,
      currentUserId: useChatListStore.getState().currentUserId ?? deps.bootstrapUserId,
      registerSnapshot: deps.registerUnreadSnapshotRef.current,
    });
    void deps
      .loadMuteSnapshot({
        subscriptions: registration?.subscriptions,
        userTopics: registration?.user_topics,
      })
      .then((snapshot) =>
        deps.applyLayoutRegisterMuteSnapshot({
          cancelled: deps.isCancelled(),
          currentInstanceId: deps.currentInstanceId,
          snapshot,
          markRegisterMuteSnapshotApplied: createRegisterMuteSnapshotAppliedMarker(
            deps.registerMuteSnapshotAppliedRef,
          ),
        }),
      )
      .catch((err) => reportUnexpectedError("layout:registerMuteSnapshot", err));
  };
}
