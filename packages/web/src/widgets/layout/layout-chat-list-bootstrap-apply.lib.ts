import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { ChatListDmMetadataRow } from "~/entities/chat-list/chat-list.model.types";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { useUsersStore } from "~/entities/user/user.model";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import {
  loadDmIndexEntries,
  upsertDmIndexFromMessages,
  type DmIndexEntry,
} from "~/shared/lib/dm-index";
import { env } from "~/shared/lib/env";
import {
  logChatListFlow,
  summarizeZulipMessagesForFlowDebug,
} from "~/shared/lib/message-flow-debug.lib";
import { getNewestMessageId } from "./layout-chat-history-sync.lib";
import type { ChatListBootstrapResult } from "./layout-chat-list-bootstrap.lib";

function toDmMetadataRowsFromIndex(entries: readonly DmIndexEntry[]): ChatListDmMetadataRow[] {
  return entries.map((entry) => ({
    userIds: entry.userIds,
    lastActivityTs: entry.lastActivityTs,
    lastMessageId: entry.lastMessageId,
    unreadCount: entry.unreadCount,
  }));
}

export interface ApplyChatListBootstrapResultOptions {
  currentInstanceId: string | null;
  setFromMessages: (messages: ZulipRawMessage[], currentUserId: number | null) => void;
  latestMessageIdRef?: { current: number | null };
}

/** Applies `runChatListBootstrap` output to stores (same rules as cold-start event-loop bootstrap). */
export function applyChatListBootstrapResult(
  result: ChatListBootstrapResult,
  options: ApplyChatListBootstrapResultOptions,
): void {
  const { currentInstanceId, setFromMessages, latestMessageIdRef } = options;
  const metadataBootstrapEnabled = env.METADATA_CHAT_BOOTSTRAP_ENABLED;
  const uid = useChatListStore.getState().currentUserId ?? null;

  logChatListFlow("bootstrapApply: start", {
    instanceId: currentInstanceId,
    metadataBootstrapEnabled,
    bootstrapMode: result.mode,
    bootstrapMessages: summarizeZulipMessagesForFlowDebug(
      result.mode === "full" || result.mode === "delta" ? result.messages : [],
    ),
    latestMessageIdHint: result.latestMessageIdHint,
  });

  if (metadataBootstrapEnabled && currentInstanceId != null) {
    const dmIndexEntries = loadDmIndexEntries(currentInstanceId);
    if (dmIndexEntries.length > 0) {
      useChatListStore.getState().upsertDmMetadataRows(toDmMetadataRowsFromIndex(dmIndexEntries));
    }
  }

  if (result.mode === "full") {
    const msgs = result.messages;
    for (const m of msgs) {
      useUsersStore.getState().mergeFromMessage(m);
    }
    if (metadataBootstrapEnabled) {
      useChatListStore.getState().addMessages(msgs);
    } else {
      setFromMessages(msgs, uid);
    }
    if (currentInstanceId != null && msgs.length > 0) {
      upsertDmIndexFromMessages(currentInstanceId, msgs, uid);
    }
    if (latestMessageIdRef != null) {
      latestMessageIdRef.current = getNewestMessageId(msgs);
    }
    if (msgs.length > 0) {
      useActivityStore.getState().markStale();
      useInboxStore.getState().markStale();
    }
    logChatListFlow("bootstrapApply: applied full", {
      streamsMapSize: useChatListStore.getState().streamsMap.size,
      dmsMapSize: useChatListStore.getState().dmsMap.size,
    });
    return;
  }

  if (result.mode === "delta") {
    for (const m of result.messages) {
      useUsersStore.getState().mergeFromMessage(m);
    }
    useChatListStore.getState().addMessages(result.messages);
    if (currentInstanceId != null && result.messages.length > 0) {
      upsertDmIndexFromMessages(currentInstanceId, result.messages, uid);
    }
    const newest = getNewestMessageId(result.messages);
    const prev = result.latestMessageIdHint;
    if (latestMessageIdRef != null) {
      latestMessageIdRef.current =
        newest != null && (prev == null || newest > prev) ? newest : (prev ?? newest);
    }
    if (result.messages.length > 0) {
      useActivityStore.getState().markStale();
      useInboxStore.getState().markStale();
    }
    logChatListFlow("bootstrapApply: applied delta", {
      streamsMapSize: useChatListStore.getState().streamsMap.size,
      dmsMapSize: useChatListStore.getState().dmsMap.size,
      latestMessageIdRef: latestMessageIdRef?.current ?? null,
    });
    return;
  }

  if (latestMessageIdRef != null && result.latestMessageIdHint != null) {
    latestMessageIdRef.current = result.latestMessageIdHint;
  }
  logChatListFlow("bootstrapApply: mode none", {
    streamsMapSize: useChatListStore.getState().streamsMap.size,
    dmsMapSize: useChatListStore.getState().dmsMap.size,
    latestMessageIdRef: latestMessageIdRef?.current ?? null,
  });
}
