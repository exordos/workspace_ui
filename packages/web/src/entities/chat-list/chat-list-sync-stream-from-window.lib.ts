/**
 * Syncs stream channel sidebar topic previews from messages loaded in the open chat window.
 */
import { isStreamSidebarTopicsHydrateInFlight } from "~/entities/chat-list/chat-list-hydrate-stream-sidebar.lib";
import { filterStreamMessagesForSidebar } from "~/entities/chat-list/chat-list-stream-preview-from-messages.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { MockMessage } from "~/shared/api/zulip.types";
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";
import { mockMessageToRawMessage } from "~/shared/lib/message-mock-to-raw.lib";

export type StreamMessagesAppliedSource = "cache" | "api";

export interface OnStreamMessagesAppliedPayload {
  messages: readonly MockMessage[];
  context: { type: "stream"; streamId: number };
  hasNewerMessages: boolean;
  focusedMessageId: number | null;
  source: StreamMessagesAppliedSource;
}

export interface SyncStreamSidebarFromLoadedMessagesOptions {
  messages: readonly MockMessage[];
  streamId: number;
  source: StreamMessagesAppliedSource;
  focusedMessageId: number | null;
  hasNewerMessages: boolean;
}

/** True when the loaded window includes the channel tail (safe for topic previews). */
export function shouldSyncStreamPreviewFromWindow(options: {
  focusedMessageId: number | null;
  hasNewerMessages: boolean;
}): boolean {
  if (options.focusedMessageId == null) {
    return true;
  }
  return !options.hasNewerMessages;
}

/** Keeps stream messages for a single channel id. */
export function filterMessagesForStreamId(
  messages: readonly MockMessage[],
  streamId: number,
): MockMessage[] {
  return messages.filter((m) => m.stream_id === streamId);
}

/** Merges loaded stream messages into chat-list previews (no unread bumps). */
export function syncStreamSidebarFromLoadedMessages(
  options: SyncStreamSidebarFromLoadedMessagesOptions,
): void {
  const forStream = filterMessagesForStreamId(options.messages, options.streamId);
  if (forStream.length > 0) {
    const raw = forStream.map((m) => mockMessageToRawMessage(m));
    useChatListStore.getState().upsertUnreadMessageLocations(raw);
  }

  if (!shouldSyncStreamPreviewFromWindow(options)) {
    logChatListFlow("chatList: skip stream preview sync from opened chat", {
      streamId: options.streamId,
      source: options.source,
      skippedReason: "focused_anchor_with_newer_messages",
      focusedMessageId: options.focusedMessageId,
      hasNewerMessages: options.hasNewerMessages,
    });
    return;
  }

  if (isStreamSidebarTopicsHydrateInFlight(options.streamId)) {
    logChatListFlow("chatList: skip stream preview sync from opened chat", {
      streamId: options.streamId,
      source: options.source,
      skippedReason: "lazy_hydrate_in_flight",
    });
    return;
  }

  if (forStream.length === 0) {
    logChatListFlow("chatList: skip stream preview sync from opened chat", {
      streamId: options.streamId,
      source: options.source,
      skippedReason: "no_matching_stream_messages",
      messageCount: options.messages.length,
    });
    return;
  }

  const raw = forStream.map((m) => mockMessageToRawMessage(m));
  const streamOnly = filterStreamMessagesForSidebar(raw);
  if (streamOnly.length === 0) {
    return;
  }

  useChatListStore.getState().applyStreamSidebarPreviewsFromMessages(streamOnly);

  logChatListFlow("chatList: sync stream preview from opened chat", {
    streamId: options.streamId,
    source: options.source,
    messageCount: streamOnly.length,
  });
}

export function handleOnStreamMessagesApplied(payload: OnStreamMessagesAppliedPayload): void {
  if (payload.context.type !== "stream") {
    return;
  }
  syncStreamSidebarFromLoadedMessages({
    messages: payload.messages,
    streamId: payload.context.streamId,
    source: payload.source,
    focusedMessageId: payload.focusedMessageId,
    hasNewerMessages: payload.hasNewerMessages,
  });
}

export function createOnStreamMessagesAppliedHandler(): (
  payload: OnStreamMessagesAppliedPayload,
) => void {
  return (payload) => {
    handleOnStreamMessagesApplied(payload);
  };
}
