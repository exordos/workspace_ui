/**
 * Syncs DM sidebar preview from messages loaded in the open chat window (initial load / reconnect).
 */
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { MockMessage } from "~/shared/api/zulip.types";
import { upsertDmIndexFromMessages } from "~/shared/lib/dm-index";
import { dmConversationKey } from "~/shared/lib/dm-key";
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";
import { mockMessageToRawMessage } from "~/shared/lib/message-mock-to-raw.lib";

export type DmMessagesAppliedSource = "cache" | "api";

/** Minimal route context for DM sidebar sync (compatible with `CurrentChatContext`). */
export type DmMessagesAppliedContext = { type: "dm"; dmKey: string } | { type: "stream" };

export interface OnDmMessagesAppliedPayload {
  messages: readonly MockMessage[];
  context: DmMessagesAppliedContext;
  hasNewerMessages: boolean;
  focusedMessageId: number | null;
  source: DmMessagesAppliedSource;
}

export interface SyncDmSidebarFromLoadedMessagesOptions {
  messages: readonly MockMessage[];
  dmKey: string;
  currentUserId: number | null;
  instanceId: string | null;
  source: DmMessagesAppliedSource;
  focusedMessageId: number | null;
  hasNewerMessages: boolean;
}

/** True when the loaded window includes the conversation tail (safe to use for last-message preview). */
export function shouldSyncDmPreviewFromWindow(options: {
  focusedMessageId: number | null;
  hasNewerMessages: boolean;
}): boolean {
  if (options.focusedMessageId == null) {
    return true;
  }
  return !options.hasNewerMessages;
}

function isPrivateMessage(message: MockMessage): message is MockMessage & {
  display_recipient: { id: number }[];
} {
  if (message.stream_id != null) {
    return false;
  }
  const recipient = message.display_recipient;
  return Array.isArray(recipient) && recipient.length > 0;
}

/** Picks the newest private message in `messages` that belongs to `dmKey`. */
export function pickNewestDmMessageForKey(
  messages: readonly MockMessage[],
  dmKey: string,
  currentUserId: number | null,
): MockMessage | null {
  let newest: MockMessage | null = null;
  for (const message of messages) {
    if (!isPrivateMessage(message)) {
      continue;
    }
    const key = dmConversationKey(message.display_recipient, currentUserId);
    if (key !== dmKey) {
      continue;
    }
    if (
      newest == null ||
      message.timestamp > newest.timestamp ||
      (message.timestamp === newest.timestamp && message.id > newest.id)
    ) {
      newest = message;
    }
  }
  return newest;
}

/** Merges the newest loaded DM message into chat-list store and DM index. */
export function syncDmSidebarFromLoadedMessages(
  options: SyncDmSidebarFromLoadedMessagesOptions,
): void {
  // Index unread message locations even when we skip preview sync (needed for update_message_flags(read)).
  const rawAll = options.messages.map((m) => mockMessageToRawMessage(m));
  useChatListStore.getState().upsertUnreadMessageLocations(rawAll);

  if (!shouldSyncDmPreviewFromWindow(options)) {
    logChatListFlow("chatList: skip DM preview sync from opened chat", {
      dmKey: options.dmKey,
      source: options.source,
      skippedReason: "focused_anchor_with_newer_messages",
      focusedMessageId: options.focusedMessageId,
      hasNewerMessages: options.hasNewerMessages,
    });
    return;
  }

  const newest = pickNewestDmMessageForKey(options.messages, options.dmKey, options.currentUserId);
  if (newest == null) {
    logChatListFlow("chatList: skip DM preview sync from opened chat", {
      dmKey: options.dmKey,
      source: options.source,
      skippedReason: "no_matching_private_messages",
      messageCount: options.messages.length,
    });
    return;
  }

  const raw = mockMessageToRawMessage(newest);
  useChatListStore.getState().addMessages([raw]);
  if (options.instanceId != null) {
    upsertDmIndexFromMessages(options.instanceId, [raw], options.currentUserId);
  }

  logChatListFlow("chatList: sync DM preview from opened chat", {
    dmKey: options.dmKey,
    source: options.source,
    messageId: newest.id,
    instanceId: options.instanceId,
  });
}

export function handleOnDmMessagesApplied(
  payload: OnDmMessagesAppliedPayload,
  options: {
    instanceId: string | null;
    currentUserId: number | null;
  },
): void {
  if (payload.context.type !== "dm") {
    return;
  }
  syncDmSidebarFromLoadedMessages({
    messages: payload.messages,
    dmKey: payload.context.dmKey,
    currentUserId: options.currentUserId,
    instanceId: options.instanceId,
    source: payload.source,
    focusedMessageId: payload.focusedMessageId,
    hasNewerMessages: payload.hasNewerMessages,
  });
}

export function createOnDmMessagesAppliedHandler(options: {
  getInstanceId: () => string | null;
  getCurrentUserId: () => number | null;
}): (payload: OnDmMessagesAppliedPayload) => void {
  return (payload) => {
    handleOnDmMessagesApplied(payload, {
      instanceId: options.getInstanceId(),
      currentUserId: options.getCurrentUserId(),
    });
  };
}
