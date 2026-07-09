/**
 * Bootstrap path for sidebar chat list: hydrate from IndexedDB snapshot.
 *
 * Pass `isStale` / `signal` from the layout effect so superseded runs (React Strict Mode, remount)
 * skip hydrate after awaits.
 */
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { METADATA_STREAM_PREVIEW_MESSAGE_LIMIT } from "~/shared/config/metadata-chat-bootstrap.constants";
import { loadChatListSnapshotRow } from "~/shared/lib/chat-list-snapshot-db";
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";
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

  if (isBootstrapSuperseded(options)) {
    logChatListFlow("bootstrap: superseded before local stream preview result", { instanceId });
    return { mode: "none", latestMessageIdHint: hint };
  }
  logChatListFlow("bootstrap: stream preview fetch skipped", { latestMessageIdHint: hint });
  return { mode: "streamPreviews", messages: [], latestMessageIdHint: hint };
}
