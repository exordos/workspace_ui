/**
 * Hydrates DM sidebar previews from register `recent_private_conversations` metadata.
 *
 * Legacy network hydrate was removed with the Zulip API cutover. The id collector remains pure;
 * the hydrate entrypoint traces a controlled no-op.
 */
import {
  summarizeRecentPrivateConversationsForTrace,
  traceDmPreviewHydrate,
} from "~/entities/chat-list/chat-list-dm-preview-hydrate-trace.lib";
import type { ChatListDmMetadataRow } from "~/entities/chat-list/chat-list.model.types";
import type { ZulipRecentPrivateConversation } from "~/shared/api/zulip.types";
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";

function addPositiveMessageId(ids: Set<number>, messageId: number | null | undefined): void {
  if (messageId != null && Number.isInteger(messageId) && messageId > 0) {
    ids.add(messageId);
  }
}

export function collectLastMessageIdsFromRecentPrivateConversations(
  conversations: Record<string, ZulipRecentPrivateConversation> | undefined,
  metadataRows?: readonly ChatListDmMetadataRow[],
): number[] {
  const ids = new Set<number>();
  if (conversations != null) {
    for (const conversation of Object.values(conversations)) {
      addPositiveMessageId(ids, conversation.max_message_id);
    }
  }
  for (const row of metadataRows ?? []) {
    addPositiveMessageId(ids, row.lastMessageId);
  }
  return [...ids];
}

export interface HydrateDmSidebarPreviewsOptions {
  conversations: Record<string, ZulipRecentPrivateConversation> | undefined;
  currentUserId: number | null;
  metadataRows?: readonly ChatListDmMetadataRow[];
  instanceId?: string;
  cancelled?: () => boolean;
}

/** Legacy DM preview network hydrate is disabled; Workspace/local paths own preview data. */
export function hydrateDmSidebarPreviewsFromRecentConversations(
  options: HydrateDmSidebarPreviewsOptions,
): Promise<void> {
  traceDmPreviewHydrate("hydrate:start", {
    instanceId: options.instanceId ?? null,
    currentUserId: options.currentUserId,
    metadataRowCount: options.metadataRows?.length ?? 0,
    conversations: summarizeRecentPrivateConversationsForTrace(options.conversations),
    cancelled: options.cancelled?.() ?? false,
  });

  const messageIds = collectLastMessageIdsFromRecentPrivateConversations(
    options.conversations,
    options.metadataRows,
  );

  traceDmPreviewHydrate("hydrate:collectedMessageIds", {
    messageIdCount: messageIds.length,
    messageIdSample: messageIds.slice(0, 12),
  });

  logChatListFlow("chatList: skip legacy DM preview hydrate (Zulip API removed)", {
    messageIdCount: messageIds.length,
    currentUserId: options.currentUserId,
    cancelled: options.cancelled?.() ?? false,
  });
  traceDmPreviewHydrate("hydrate:skip", {
    reason: "legacy_zulip_api_removed",
    messageIdCount: messageIds.length,
  });
  return Promise.resolve();
}
