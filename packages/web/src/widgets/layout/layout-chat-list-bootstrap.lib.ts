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
} from "~/shared/api/messenger-sidebar-preview.lib";
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { METADATA_STREAM_PREVIEW_MESSAGE_LIMIT } from "~/shared/config/metadata-chat-bootstrap.constants";
import { loadChatListSnapshotRow } from "~/shared/lib/chat-list-snapshot-db";
import {
  logChatListFlow,
  summarizeMessengerMessagesForFlowDebug,
} from "~/shared/lib/message-flow-debug.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { getInMemoryLatestMessageId } from "./layout-chat-list-latest-message-id.lib";

/** Stream preview batch size (metadata-first bootstrap). */
export function getStreamPreviewBatchLimit(): number {
  return METADATA_STREAM_PREVIEW_MESSAGE_LIMIT;
}

export type ChatListBootstrapResult =
  | {
      mode: "streamPreviews";
      messages: WorkspaceRawMessage[];
      latestMessageIdHint: MessageId | null;
    }
  | { mode: "none"; latestMessageIdHint: MessageId | null };

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
  hint: MessageId | null,
  options?: RunChatListBootstrapOptions,
): Promise<WorkspaceRawMessage[]> {
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
      const delta = await fetchMessagesAfterAnchor(hint, limit, options?.signal);
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

  logChatListFlow("bootstrap: stream preview recent messages", {
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

  // Realtime REST catch-up owns reconnect gaps. Re-reading snapshots or messages here duplicates
  // the same work and can regress state behind an already committed event cursor.
  if (kind === "reconnect") {
    return { mode: "none", latestMessageIdHint: getInMemoryLatestMessageId() };
  }

  const snap = await loadChatListSnapshotRow(instanceId);
  if (isBootstrapSuperseded(options)) {
    logChatListFlow("bootstrap: superseded after IDB read (no hydrate/clear)", { instanceId });
    return { mode: "none", latestMessageIdHint: null };
  }

  if (snap) {
    useChatListStore.getState().hydrateFromIndexedDbSnapshot(snap);
    return { mode: "none", latestMessageIdHint: snap.lastMessageId ?? null };
  } else {
    useChatListStore.getState().clear();
    logChatListFlow("bootstrap: no IDB snapshot, store cleared", { instanceId });
  }

  const hint: MessageId | null = null;

  const streamMessages = await fetchStreamPreviewMessageBatch(hint, options);
  if (isBootstrapSuperseded(options)) {
    logChatListFlow("bootstrap: superseded after stream preview fetch", { instanceId });
    return { mode: "none", latestMessageIdHint: hint };
  }
  logChatListFlow("bootstrap: streamPreviews", {
    latestMessageIdHint: hint,
    ...summarizeMessengerMessagesForFlowDebug(streamMessages),
  });
  return { mode: "streamPreviews", messages: streamMessages, latestMessageIdHint: hint };
}
