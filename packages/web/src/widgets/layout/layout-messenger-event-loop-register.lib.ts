import { useActivityStore } from "~/entities/activity/activity.model";
import { queuePriorityStreamSidebarTopicsHydrate } from "~/entities/chat-list/chat-list-hydrate-stream-sidebar.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type {
  ChatListStreamMetadataRow,
  ChatListStreamTopicMetadataRow,
} from "~/entities/chat-list/chat-list.model.types";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useNotificationSettingsStore } from "~/entities/notification-settings/notification-settings.model";
import { applyUserStatusSnapshot } from "~/entities/user/api/user-status-write.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { useUserGroupsStore } from "~/entities/user-group/user-group.model";
import type { MessengerUnreadMessagesSnapshot } from "~/shared/api/messenger-unread.lib";
import type {
  MessengerMeStream,
  MessengerStreamTopic,
  RegisterQueueResult,
  MessengerSubscription,
} from "~/shared/api/messenger.types";
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import { numericUserIdOrNull, userIdStorageKey, type UserId } from "~/shared/lib/user-id.lib";
import { setCachedRegisterUnreadSnapshot } from "./layout-instance-register-unread.lib";
import { createRegisterMuteSnapshotAppliedMarker } from "./layout-messenger-event-loop-bootstrap.lib";
import {
  flushReconnectStreamPreviewsAfterRegister,
  markReconnectStreamPreviewRegisterReady,
} from "./layout-reconnect-stream-preview.lib";
import type { ChatListBootstrapResult } from "./layout-chat-list-bootstrap.lib";
import type { LayoutMuteBootstrapData, LayoutMuteSnapshot } from "./layout-instance-bootstrap.hook";

export function toStreamMetadataRows(
  subscriptions: readonly MessengerSubscription[],
): ChatListStreamMetadataRow[] {
  return subscriptions
    .filter(
      (subscription): subscription is MessengerSubscription =>
        subscription.stream_uuid.trim().length > 0 && subscription.name.trim().length > 0,
    )
    .map((subscription) => {
      const creatorId =
        typeof subscription.creator_id === "number" &&
        Number.isInteger(subscription.creator_id) &&
        subscription.creator_id > 0
          ? subscription.creator_id
          : undefined;
      return {
        streamUuid: subscription.stream_uuid,
        name: subscription.name,
        ...(typeof subscription.is_archived === "boolean"
          ? { isArchived: subscription.is_archived }
          : {}),
        ...(creatorId != null ? { creatorId } : {}),
        ...(typeof subscription.invite_only === "boolean"
          ? { inviteOnly: subscription.invite_only }
          : {}),
        ...(typeof subscription.private === "boolean" ? { private: subscription.private } : {}),
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

export function toSubscriptionsFromMeStreams(
  streams: readonly MessengerMeStream[],
): MessengerSubscription[] {
  return streams.map((stream) => ({
    stream_uuid: stream.stream_uuid,
    name: stream.name,
    is_muted: false,
    invite_only: stream.invite_only,
    private: stream.private,
  }));
}

export function toStreamTopicMetadataRows(
  topics: readonly MessengerStreamTopic[],
): ChatListStreamTopicMetadataRow[] {
  return topics
    .filter((topic) => topic.uuid.trim().length > 0 && topic.stream_uuid.trim().length > 0)
    .map((topic) => ({
      topicUuid: topic.uuid,
      streamUuid: topic.stream_uuid,
      name: topic.name,
      ...(topic.default_for_stream_uuid != null
        ? { defaultForStreamUuid: topic.default_for_stream_uuid }
        : {}),
    }));
}

function streamMetadataRowMissingInChatList(
  streamsMap: ReadonlyMap<string, unknown>,
  row: ChatListStreamMetadataRow,
): boolean {
  return !streamsMap.has(row.streamUuid);
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
  const snapshotUserIds = new Set<string>();

  for (const entry of snapshot) {
    if (useUsersStore.getState().getUser(entry.userId) == null) {
      continue;
    }
    snapshotUserIds.add(userIdStorageKey(entry.userId));
    applyUserStatusSnapshot(entry.userId, entry.status, fetchedAt);
  }

  for (const user of useUsersStore.getState().users.values()) {
    if (user.status == null || snapshotUserIds.has(userIdStorageKey(user.user_id))) {
      continue;
    }
    applyUserStatusSnapshot(user.user_id, null, fetchedAt);
  }
}

export interface LayoutBootstrapQueueRegisteredDeps {
  isCancelled: () => boolean;
  currentInstanceId: string | null;
  bootstrapUserId: UserId | null;
  queueIdRef: { current: string | null };
  registerUnreadSnapshotRef: { current: MessengerUnreadMessagesSnapshot | null };
  reconcileSidebarUnreadFromRegister: (
    instanceId: string | null,
    registration: RegisterQueueResult | undefined,
    currentUserId: number | null,
  ) => void;
  streamPreviewCoordinator: { markRegisterHydrationReady: () => void };
  tryFlushMetadataStreamPreviews: () => void;
  applyChatListBootstrapResult: (result: ChatListBootstrapResult, applyOptions: unknown) => void;
  startSidebarUnreadReconcile: (params: {
    cancelled: () => boolean;
    instanceId: string | null;
    currentUserId: number | null;
    registerSnapshot: MessengerUnreadMessagesSnapshot | null;
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
    const numericCurrentUserId = numericUserIdOrNull(
      useChatListStore.getState().currentUserId ?? deps.bootstrapUserId,
    );
    deps.startSidebarUnreadReconcile({
      cancelled: deps.isCancelled,
      instanceId: deps.currentInstanceId,
      currentUserId: numericCurrentUserId,
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
