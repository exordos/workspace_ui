import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useNotificationSettingsStore } from "~/entities/notification-settings/notification-settings.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useChatInfoStore } from "~/features/chat-info/chat-info.model";
import { publishExternalAccountUpdated } from "~/features/external-accounts/external-account-realtime.lib";
import {
  persistCurrentFolderSnapshot,
  useFolderSyncStore,
} from "~/features/folder-sync/folder-sync.model";
import { useJitsiCallStore } from "~/features/jitsi-call/jitsi-call.model";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { useTypingIndicatorStore } from "~/features/typing-indicator/typing-indicator.model";
import { upsertDmIndexFromMessages } from "~/shared/lib/dm-index";
import {
  adaptWorkspaceEventForMessenger,
  type MessengerEventDeliveryContext,
} from "~/shared/lib/event-loop";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { playNotificationSound } from "~/shared/lib/notification-sound";
import { resolveNotificationSoundPreset } from "~/shared/lib/notification-sound-preset.lib";
import { notificationService } from "~/shared/lib/notifications";
import {
  applyWorkspaceFileCacheEvent,
  resolveCurrentWorkspaceFileCacheScope,
} from "~/shared/lib/workspace-file-blob-cache";
import type { WorkspaceEvent } from "~/shared/types/workspace-event";
import { persistWorkspaceEntityEventToCache } from "./layout-messenger-entities-event-cache.lib";
import { handleCanonicalGroupwareEvent } from "./layout-messenger-event-dispatch-groupware.lib";
import {
  buildLayoutNotificationsActions,
  dispatchMessengerEvent,
} from "./layout-messenger-event-dispatch.lib";

function closeLayoutNotificationByTag(tag: string): void {
  void notificationService.closeByTag(tag);
}

function playLayoutNotificationSound(preset?: string): void {
  if (
    preset == null ||
    preset === "default" ||
    preset === "subtle" ||
    preset === "digital" ||
    preset === "glass" ||
    preset === "pulse" ||
    preset === "none"
  ) {
    playNotificationSound(preset);
  }
}

function getLayoutNotificationSoundPreset(): string {
  const server = useNotificationSettingsStore.getState().settings;
  const local = useSettingsStore.getState().notificationSound;
  return resolveNotificationSoundPreset(server.notificationSound, local);
}

interface LatestMessageIdRef {
  current: MessageId | null;
}

export function updateLatestMessageIdMax(ref: LatestMessageIdRef, id: MessageId): void {
  ref.current = id;
}

export interface LayoutMessengerEventLoopOnEventOptions {
  currentInstanceId: string | null;
  latestMessageIdRef: LatestMessageIdRef;
}

export function createLayoutMessengerEventLoopOnEventHandler(
  options: LayoutMessengerEventLoopOnEventOptions,
): (event: WorkspaceEvent, delivery?: MessengerEventDeliveryContext) => Promise<void> {
  return async (event, delivery) => {
    await handleLayoutMessengerEventLoopQueueEvent(event, options, delivery);
    const fileCacheScope = resolveCurrentWorkspaceFileCacheScope();
    await Promise.all([
      persistWorkspaceEntityEventToCache(event),
      fileCacheScope == null
        ? Promise.resolve()
        : applyWorkspaceFileCacheEvent(fileCacheScope, event),
      event.object_type === "stream" ||
      event.object_type === "folder" ||
      event.object_type === "folder_item"
        ? persistCurrentFolderSnapshot()
        : Promise.resolve(),
    ]);
  };
}

export function handleLayoutMessengerEventLoopQueueEvent(
  event: WorkspaceEvent,
  options: LayoutMessengerEventLoopOnEventOptions,
  delivery?: MessengerEventDeliveryContext,
): Promise<void> {
  if (
    event.object_type === "mail_folder" ||
    event.object_type === "mail_message" ||
    event.object_type === "calendar" ||
    event.object_type === "calendar_event"
  ) {
    handleCanonicalGroupwareEvent(event);
    return Promise.resolve();
  }
  if (
    event.object_type === "external_account" ||
    event.object_type === "external_chat" ||
    event.object_type === "external_operation"
  ) {
    publishExternalAccountUpdated(event.payload);
    return Promise.resolve();
  }
  const adapted = adaptWorkspaceEventForMessenger(event);
  if (adapted?.event == null) return Promise.resolve();
  const chatList = useChatListStore.getState();
  const currentChat = useCurrentChatMessagesStore.getState();
  const users = useUsersStore.getState();
  const mute = useMuteStore.getState();
  const typing = useTypingIndicatorStore.getState();
  const activity = useActivityStore.getState();
  const inbox = useInboxStore.getState();
  const jitsiCall = useJitsiCallStore.getState();
  const folderSync = useFolderSyncStore.getState();

  return dispatchMessengerEvent(adapted.event, {
    notificationsEnabled: delivery?.notificationsAllowed ?? true,
    currentInstanceId: options.currentInstanceId,
    chatList,
    currentChat,
    users,
    mute,
    typing,
    activity,
    inbox,
    jitsiCall,
    folderSync,
    chatInfo: {
      applyStreamMetadataUpdate: ({ instanceId, streamUuid, name, description }) => {
        const metadata: { name?: string; description?: string | null } = {};
        if (name !== undefined) {
          metadata.name = name;
        }
        if (description !== undefined) {
          metadata.description = description;
        }
        useChatInfoStore.getState().applyStreamMetadataUpdate(instanceId, streamUuid, metadata);
      },
    },
    notifications: buildLayoutNotificationsActions({
      show: notificationService.show,
      closeByTag: closeLayoutNotificationByTag,
      playSound: playLayoutNotificationSound,
      getSoundPreset: getLayoutNotificationSoundPreset,
    }),
    updateLatestMessageId: (id) => {
      updateLatestMessageIdMax(options.latestMessageIdRef, id);
    },
    onStreamPeerMembersChanged: (streamIds) => {
      if (options.currentInstanceId == null) {
        return;
      }
      const chatInfoStore = useChatInfoStore.getState();
      for (const streamId of streamIds) {
        chatInfoStore.invalidateStream(options.currentInstanceId, streamId);
      }
    },
    onMessage: (message) => {
      if (options.currentInstanceId == null) {
        return;
      }
      upsertDmIndexFromMessages(
        options.currentInstanceId,
        [message],
        useChatListStore.getState().currentUserId,
      );
    },
  });
}
