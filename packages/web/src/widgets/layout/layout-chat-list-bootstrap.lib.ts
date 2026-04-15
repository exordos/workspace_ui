/**
 * Bootstrap path for sidebar chat list: hydrate from IndexedDB snapshot, then either
 * incremental fetch after `lastMessageId` or full recent+deep history.
 *
 * Pass `isStale` / `signal` from the layout effect so superseded runs (React Strict Mode, remount)
 * skip hydrate and API after awaits — avoids duplicate IDB paint + duplicate GET /messages.
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
import {
  logChatListFlow,
  summarizeZulipMessagesForFlowDebug,
} from "~/shared/lib/message-flow-debug.lib";
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

export interface RunChatListBootstrapOptions {
  /** When aborted, skips further work after awaits (fetch cannot be cancelled here yet). */
  signal?: AbortSignal;
  /** When true, this bootstrap was superseded (effect cleanup / newer mount) — skip hydrate and network. */
  isStale?: () => boolean;
}

function isBootstrapSuperseded(options?: RunChatListBootstrapOptions): boolean {
  return (options?.signal?.aborted ?? false) || (options?.isStale?.() ?? false);
}

export async function runChatListBootstrap(
  instanceId: string | null,
  options?: RunChatListBootstrapOptions,
): Promise<ChatListBootstrapResult> {
  if (!instanceId) {
    logChatListFlow("bootstrap: runChatListBootstrap (skip, no instanceId)", {});
    return { mode: "none", latestMessageIdHint: null };
  }

  logChatListFlow("bootstrap: runChatListBootstrap (start)", {
    instanceId,
    metadataChatBootstrap: env.METADATA_CHAT_BOOTSTRAP_ENABLED,
  });

  const snap = await loadChatListSnapshotRow(instanceId);
  if (isBootstrapSuperseded(options)) {
    logChatListFlow("bootstrap: superseded after IDB read (no hydrate/clear)", { instanceId });
    return { mode: "none", latestMessageIdHint: null };
  }

  if (snap) {
    useChatListStore.getState().hydrateFromIndexedDbSnapshot(snap);
  } else {
    useChatListStore.getState().clear();
    logChatListFlow("bootstrap: no IDB snapshot, store cleared", { instanceId });
  }

  const hint = snap?.lastMessageId ?? null;

  if (snap?.lastMessageId != null) {
    try {
      if (isBootstrapSuperseded(options)) {
        logChatListFlow("bootstrap: superseded before delta fetch", { instanceId });
        return { mode: "none", latestMessageIdHint: hint };
      }
      logChatListFlow("bootstrap: attempting delta after lastMessageId", {
        lastMessageId: snap.lastMessageId,
        limit: DELTA_AFTER_ANCHOR_LIMIT,
      });
      const delta = await fetchMessagesAfterAnchor(snap.lastMessageId, DELTA_AFTER_ANCHOR_LIMIT);
      if (isBootstrapSuperseded(options)) {
        logChatListFlow("bootstrap: superseded after delta fetch (result discarded)", {
          instanceId,
        });
        return { mode: "none", latestMessageIdHint: hint };
      }
      logChatListFlow("bootstrap: delta path success", {
        ...summarizeZulipMessagesForFlowDebug(delta),
        latestMessageIdHint: hint,
      });
      return { mode: "delta", messages: delta, latestMessageIdHint: hint };
    } catch {
      if (isBootstrapSuperseded(options)) {
        logChatListFlow("bootstrap: superseded during delta error path", { instanceId });
        return { mode: "none", latestMessageIdHint: hint };
      }
      logChatListFlow("bootstrap: delta fetch failed", {
        metadataChatBootstrap: env.METADATA_CHAT_BOOTSTRAP_ENABLED,
      });
      if (env.METADATA_CHAT_BOOTSTRAP_ENABLED) {
        // Зачем: в metadata-first режиме не проваливаемся в тяжелый full-bootstrap.
        return { mode: "none", latestMessageIdHint: hint };
      }
      // fall through to full bootstrap
    }
  }

  if (env.METADATA_CHAT_BOOTSTRAP_ENABLED) {
    // Что делает: оставляем восстановление списка чатов на metadata + события + фоновый backfill.
    logChatListFlow("bootstrap: mode none (metadata-first, no full message window)", {
      latestMessageIdHint: hint,
    });
    return { mode: "none", latestMessageIdHint: hint };
  }

  if (isBootstrapSuperseded(options)) {
    logChatListFlow("bootstrap: superseded before full path fetch", { instanceId });
    return { mode: "none", latestMessageIdHint: hint };
  }

  logChatListFlow("bootstrap: full path (recent + deep history)", {});
  const initialMessages = await fetchRecentMessages();
  if (isBootstrapSuperseded(options)) {
    logChatListFlow("bootstrap: superseded after fetchRecentMessages", { instanceId });
    return { mode: "none", latestMessageIdHint: hint };
  }
  const full = await loadDeepHistoryMessages({
    initialMessages,
    fetchOlderMessages: (anchorId, numBefore) => fetchMessagesBeforeAnchor(anchorId, numBefore),
    pageSize: CHAT_HISTORY_BATCH_SIZE,
    maxBatches: CHAT_HISTORY_MAX_BATCHES,
  });
  if (isBootstrapSuperseded(options)) {
    logChatListFlow("bootstrap: superseded after deep history merge", { instanceId });
    return { mode: "none", latestMessageIdHint: hint };
  }
  logChatListFlow("bootstrap: full path merged", {
    ...summarizeZulipMessagesForFlowDebug(full),
    latestMessageIdHint: hint,
  });

  return { mode: "full", messages: full, latestMessageIdHint: hint };
}
