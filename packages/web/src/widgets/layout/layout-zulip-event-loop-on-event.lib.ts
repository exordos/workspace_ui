import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useNotificationSettingsStore } from "~/entities/notification-settings/notification-settings.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useChatInfoStore } from "~/features/chat-info/chat-info.model";
import { useJitsiCallStore } from "~/features/jitsi-call/jitsi-call.model";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { useTypingIndicatorStore } from "~/features/typing-indicator/typing-indicator.model";
import type { ZulipEvent } from "~/shared/api/zulip.types";
import { upsertDmIndexFromMessages } from "~/shared/lib/dm-index";
import { playNotificationSound } from "~/shared/lib/notification-sound";
import { resolveNotificationSoundPreset } from "~/shared/lib/notification-sound-preset.lib";
import { notificationService } from "~/shared/lib/notifications";
import {
  buildLayoutNotificationsActions,
  dispatchZulipEvent,
} from "./layout-zulip-event-dispatch.lib";

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
  current: number | null;
}

export function updateLatestMessageIdMax(ref: LatestMessageIdRef, id: number): void {
  if (ref.current == null || id > ref.current) {
    ref.current = id;
  }
}

export interface LayoutZulipEventLoopOnEventOptions {
  currentInstanceId: string | null;
  latestMessageIdRef: LatestMessageIdRef;
}

export function createLayoutZulipEventLoopOnEventHandler(
  options: LayoutZulipEventLoopOnEventOptions,
): (event: ZulipEvent) => void {
  return (event) => handleLayoutZulipEventLoopQueueEvent(event, options);
}

export function handleLayoutZulipEventLoopQueueEvent(
  event: ZulipEvent,
  options: LayoutZulipEventLoopOnEventOptions,
): void {
  const chatList = useChatListStore.getState();
  const currentChat = useCurrentChatMessagesStore.getState();
  const users = useUsersStore.getState();
  const mute = useMuteStore.getState();
  const typing = useTypingIndicatorStore.getState();
  const activity = useActivityStore.getState();
  const inbox = useInboxStore.getState();
  const jitsiCall = useJitsiCallStore.getState();

  dispatchZulipEvent(event, {
    chatList,
    currentChat,
    users,
    mute,
    typing,
    activity,
    inbox,
    jitsiCall,
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
