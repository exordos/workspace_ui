/**
 * Bootstrap path for sidebar chat list: hydrate from IndexedDB snapshot, then either
 * incremental fetch after `lastMessageId` or full recent+deep history.
 */
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import {
  fetchMessagesAfterAnchor,
  fetchMessagesBeforeAnchor,
  fetchRecentMessages,
} from "~/shared/api/zulip";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { loadChatListSnapshotRow } from "~/shared/lib/chat-list-snapshot-db";
import { env } from "~/shared/lib/env";
import { loadDeepHistoryMessages } from "./layout-chat-history-sync.lib";

// Что делает: размер одной страницы при подгрузке старой истории.
const CHAT_HISTORY_BATCH_SIZE = 5000;
// Зачем: ограничивает глубину bootstrap, чтобы не перегружать сеть и UI.
const CHAT_HISTORY_MAX_BATCHES = 5;
// Что делает: верхняя граница дельты после снапшота.
const DELTA_AFTER_ANCHOR_LIMIT = 5000;

export type ChatListBootstrapResult =
  | { mode: "full"; messages: ZulipRawMessage[]; latestMessageIdHint: number | null }
  | { mode: "delta"; messages: ZulipRawMessage[]; latestMessageIdHint: number | null }
  | { mode: "none"; latestMessageIdHint: number | null };

export async function runChatListBootstrap(
  instanceId: string | null,
): Promise<ChatListBootstrapResult> {
  if (!instanceId) {
    return { mode: "none", latestMessageIdHint: null };
  }

  const snap = await loadChatListSnapshotRow(instanceId);
  if (snap) {
    useChatListStore.getState().hydrateFromIndexedDbSnapshot(snap);
  } else {
    useChatListStore.getState().clear();
  }

  const hint = snap?.lastMessageId ?? null;

  if (snap?.lastMessageId != null) {
    try {
      const delta = await fetchMessagesAfterAnchor(snap.lastMessageId, DELTA_AFTER_ANCHOR_LIMIT);
      return { mode: "delta", messages: delta, latestMessageIdHint: hint };
    } catch {
      if (env.METADATA_CHAT_BOOTSTRAP_ENABLED) {
        // Зачем: в metadata-first режиме не проваливаемся в тяжелый full-bootstrap.
        return { mode: "none", latestMessageIdHint: hint };
      }
      // fall through to full bootstrap
    }
  }

  if (env.METADATA_CHAT_BOOTSTRAP_ENABLED) {
    // Что делает: оставляем восстановление списка чатов на metadata + события + фоновый backfill.
    return { mode: "none", latestMessageIdHint: hint };
  }

  const initialMessages = await fetchRecentMessages();
  const full = await loadDeepHistoryMessages({
    initialMessages,
    fetchOlderMessages: (anchorId, numBefore) => fetchMessagesBeforeAnchor(anchorId, numBefore),
    pageSize: CHAT_HISTORY_BATCH_SIZE,
    maxBatches: CHAT_HISTORY_MAX_BATCHES,
  });

  return { mode: "full", messages: full, latestMessageIdHint: hint };
}
