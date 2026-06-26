import { useActivityStore } from "~/entities/activity/activity.model";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { ChatListDmMetadataRow } from "~/entities/chat-list/chat-list.model.types";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import {
  isActiveOrgRequestInvalidated,
  type ActiveOrgRequestContext,
} from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { loadDmIndexEntries, type DmIndexEntry } from "~/shared/lib/dm-index";
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
  orgContext?: ActiveOrgRequestContext;
  signal?: AbortSignal;
  /** When true, skips DM index restore (caller already hydrated once). */
  skipDmIndexHydrate?: boolean;
}

/** Restores DM sidebar rows from local DM index after metadata-first bootstrap. */
export function hydrateChatListDmIndexForInstance(currentInstanceId: string | null): void {
  if (currentInstanceId == null) {
    return;
  }
  const dmIndexEntries = loadDmIndexEntries(currentInstanceId);
  if (dmIndexEntries.length > 0) {
    useChatListStore.getState().upsertDmMetadataRows(toDmMetadataRowsFromIndex(dmIndexEntries));
  }
}

/** Applies `runChatListBootstrap` output to stores (same rules as cold-start event-loop bootstrap). */
export function applyChatListBootstrapResult(
  result: ChatListBootstrapResult,
  options: ApplyChatListBootstrapResultOptions,
): void {
  const { currentInstanceId, latestMessageIdRef } = options;
  if (
    options.orgContext != null &&
    isActiveOrgRequestInvalidated(options.orgContext, options.signal)
  ) {
    logChatListFlow("bootstrapApply: skipped stale active org", {
      instanceId: currentInstanceId,
      bootstrapMode: result.mode,
    });
    return;
  }

  logChatListFlow("bootstrapApply: start", {
    instanceId: currentInstanceId,
    bootstrapMode: result.mode,
    bootstrapMessages: summarizeZulipMessagesForFlowDebug(
      result.mode === "streamPreviews" ? result.messages : [],
    ),
    latestMessageIdHint: result.latestMessageIdHint,
    skipDmIndexHydrate: options.skipDmIndexHydrate === true,
  });

  if (options.skipDmIndexHydrate !== true) {
    hydrateChatListDmIndexForInstance(currentInstanceId);
  }

  if (result.mode === "streamPreviews") {
    for (const m of result.messages) {
      useUsersStore.getState().mergeFromMessage(m);
    }
    useChatListStore.getState().applyStreamSidebarPreviewsFromMessages(result.messages);
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
    logChatListFlow("bootstrapApply: applied streamPreviews", {
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
