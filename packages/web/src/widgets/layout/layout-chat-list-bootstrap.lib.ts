/**
 * Bootstrap path for sidebar chat list: hydrate from IndexedDB snapshot, then either
 * incremental fetch after `lastMessageId` or full recent+deep history.
 *
 * Pass `isStale` / `signal` from the layout effect so superseded runs (React Strict Mode, remount)
 * skip hydrate and API after awaits — avoids duplicate IDB paint + duplicate GET /messages.
 */
import { filterStreamMessagesForSidebar } from "~/entities/chat-list/chat-list-stream-preview-from-messages.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import {
  fetchMessagesAfterAnchor,
  fetchRecentStreamMessagesForSidebarPreview,
  fetchStreamUnreadMessagesForSidebarPreview,
} from "~/shared/api/zulip-sidebar-preview.lib";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { METADATA_STREAM_PREVIEW_MESSAGE_LIMIT } from "~/shared/config/metadata-chat-bootstrap.constants";
import { loadChatListSnapshotRow } from "~/shared/lib/chat-list-snapshot-db";
import {
  logChatListFlow,
  summarizeZulipMessagesForFlowDebug,
} from "~/shared/lib/message-flow-debug.lib";
import { buildStreamSidebarPreviewNarrow } from "~/shared/lib/zulip-stream-sidebar-preview-narrow.lib";
import { normalizeZulipMessagesNarrowForApi } from "~/shared/lib/zulip-topic-narrow.lib";
import { getInMemoryLatestMessageId, maxMessageId } from "./layout-chat-list-latest-message-id.lib";

/** Stream preview batch size (metadata-first bootstrap). */
export function getStreamPreviewBatchLimit(): number {
  return METADATA_STREAM_PREVIEW_MESSAGE_LIMIT;
}

export type ChatListBootstrapResult =
  | { mode: "streamPreviews"; messages: ZulipRawMessage[]; latestMessageIdHint: number | null }
  | { mode: "none"; latestMessageIdHint: number | null };

export type ChatListBootstrapKind = "cold" | "reconnect";

export interface RunChatListBootstrapOptions {
  /** When aborted, skips further work after awaits (fetch cannot be cancelled here yet). */
  signal?: AbortSignal;
  /** When true, this bootstrap was superseded (effect cleanup / newer mount) — skip hydrate and network. */
  isStale?: () => boolean;
  /**
   * `cold` — hydrate/clear from IndexedDB then fetch (initial load).
   * `reconnect` — keep in-memory sidebar, delta from max(IDB hint, in-memory anchor).
   */
  kind?: ChatListBootstrapKind;
}

function isBootstrapSuperseded(options?: RunChatListBootstrapOptions): boolean {
  return (options?.signal?.aborted ?? false) || (options?.isStale?.() ?? false);
}

/** One batch of stream messages for sidebar preview in metadata-first (no unread reconcile). */
async function fetchStreamPreviewMessageBatch(
  hint: number | null,
  options?: RunChatListBootstrapOptions,
): Promise<ZulipRawMessage[]> {
  const limit = getStreamPreviewBatchLimit();

  if (hint != null) {
    try {
      if (isBootstrapSuperseded(options)) {
        return [];
      }
      logChatListFlow("bootstrap: stream preview delta after anchor", {
        lastMessageId: hint,
        limit,
      });
      const delta = await fetchMessagesAfterAnchor(
        hint,
        limit,
        normalizeZulipMessagesNarrowForApi(buildStreamSidebarPreviewNarrow(false)),
        options?.signal,
      );
      if (isBootstrapSuperseded(options)) {
        return [];
      }
      return filterStreamMessagesForSidebar(delta);
    } catch {
      if (isBootstrapSuperseded(options)) {
        return [];
      }
      logChatListFlow("bootstrap: stream preview delta failed, falling back", { hint });
    }
  }

  if (isBootstrapSuperseded(options)) {
    return [];
  }

  logChatListFlow("bootstrap: stream preview unread snapshot (channels only)", { limit });
  const unread = await fetchStreamUnreadMessagesForSidebarPreview(limit, options?.signal);
  if (isBootstrapSuperseded(options)) {
    return [];
  }
  const streamUnread = filterStreamMessagesForSidebar(unread ?? []);
  if (streamUnread.length > 0) {
    return streamUnread;
  }

  logChatListFlow("bootstrap: stream preview recent messages (unread snapshot empty)", {
    limit,
  });
  const recent = await fetchRecentStreamMessagesForSidebarPreview(limit, options?.signal);
  if (isBootstrapSuperseded(options)) {
    return [];
  }
  return filterStreamMessagesForSidebar(recent);
}

export async function runChatListBootstrap(
  instanceId: string | null,
  options?: RunChatListBootstrapOptions,
): Promise<ChatListBootstrapResult> {
  if (!instanceId) {
    logChatListFlow("bootstrap: runChatListBootstrap (skip, no instanceId)", {});
    return { mode: "none", latestMessageIdHint: null };
  }

  const kind = options?.kind ?? "cold";

  logChatListFlow("bootstrap: runChatListBootstrap (start)", { instanceId, kind });

  const snap = await loadChatListSnapshotRow(instanceId);
  if (isBootstrapSuperseded(options)) {
    logChatListFlow("bootstrap: superseded after IDB read (no hydrate/clear)", { instanceId });
    return { mode: "none", latestMessageIdHint: null };
  }

  if (kind === "cold") {
    if (snap) {
      useChatListStore.getState().hydrateFromIndexedDbSnapshot(snap);
    } else {
      useChatListStore.getState().clear();
      logChatListFlow("bootstrap: no IDB snapshot, store cleared", { instanceId });
    }
  }

  const idbHint = snap?.lastMessageId ?? null;
  const hint = kind === "reconnect" ? maxMessageId(idbHint, getInMemoryLatestMessageId()) : idbHint;

  const streamMessages = await fetchStreamPreviewMessageBatch(hint, options);
  if (isBootstrapSuperseded(options)) {
    logChatListFlow("bootstrap: superseded after stream preview fetch", { instanceId });
    return { mode: "none", latestMessageIdHint: hint };
  }
  logChatListFlow("bootstrap: streamPreviews", {
    latestMessageIdHint: hint,
    ...summarizeZulipMessagesForFlowDebug(streamMessages),
  });
  return { mode: "streamPreviews", messages: streamMessages, latestMessageIdHint: hint };
}
