/**
 * Sidebar chat-list preview and DM backfill via GET /messages.
 *
 * Metadata-first stream sidebar preview, per-channel topic hydrate,
 * unread stream snapshots, reconnect deltas, and DM page backfill.
 *
 * Usage:
 *   import { fetchRecentStreamMessagesForSidebarPreview } from "~/shared/api/zulip-sidebar-preview.lib";
 */
import { STREAM_SIDEBAR_TOPIC_HYDRATE_LIMIT } from "~/shared/config/metadata-chat-bootstrap.constants";
import { guard } from "~/shared/lib/guards";
import {
  logChatListFlow,
  summarizeZulipMessagesForFlowDebug,
} from "~/shared/lib/message-flow-debug.lib";
import { ZULIP_STREAM_CHAT_NUM_AFTER } from "~/shared/lib/zulip-message-window.lib";
import { buildStreamSidebarPreviewNarrow } from "~/shared/lib/zulip-stream-sidebar-preview-narrow.lib";
import { normalizeZulipMessagesNarrowForApi } from "~/shared/lib/zulip-topic-narrow.lib";
import { zulipPipelineGet } from "./zulip-pipeline.internal";
import { validateNonNegativeInteger } from "./zulip-validation.internal";
import type { DirectMessagesPageResult, ZulipRawMessage } from "./zulip.types";

interface MessageWindowOptions {
  anchor: string | number;
  numBefore: number;
  numAfter: number;
  includeAnchor?: boolean;
  narrow?: { operator: string; operand: string | number | number[] }[];
  applyMarkdown?: boolean;
  signal?: AbortSignal;
  /** When set and `CHAT_LIST_FLOW_DEBUG` is on, logs GET /messages for sidebar bootstrap. */
  flowDebugLabel?: string;
}

// `zulipPipelineGet` returns null on network failure unless aborted.
// Message loaders must throw so callers surface errors instead of treating [] as success.
function throwIfZulipPipelineGetNull(
  response: { ok: boolean; status: number; data: unknown } | null,
  signal?: AbortSignal,
): asserts response is { ok: boolean; status: number; data: unknown } {
  if (response != null) return;
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  throw new Error("Zulip request failed");
}

async function fetchMessageWindow(options: MessageWindowOptions): Promise<ZulipRawMessage[]> {
  const {
    anchor,
    numBefore,
    numAfter,
    includeAnchor,
    narrow,
    applyMarkdown = false,
    signal,
    flowDebugLabel,
  } = options;
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (flowDebugLabel != null) {
    logChatListFlow(`api: GET /messages → ${flowDebugLabel} (request)`, {
      anchor,
      numBefore,
      numAfter,
      includeAnchor: includeAnchor ?? null,
      hasNarrow: narrow != null,
      applyMarkdown,
    });
  }
  const res = await zulipPipelineGet(
    "/messages",
    {
      anchor: String(anchor),
      ...(includeAnchor == null ? {} : { include_anchor: includeAnchor ? "true" : "false" }),
      num_before: String(numBefore),
      num_after: String(numAfter),
      ...(narrow == null ? {} : { narrow: JSON.stringify(narrow) }),
      client_gravatar: "true",
      allow_empty_topic_name: "true",
      apply_markdown: applyMarkdown ? "true" : "false",
    },
    signal,
  );
  throwIfZulipPipelineGetNull(res, signal);
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (!res.ok) {
    if (flowDebugLabel != null) {
      logChatListFlow(`api: GET /messages → ${flowDebugLabel} (non-ok)`, { ok: false });
    }
    return [];
  }
  const data = res.data as { result?: string; messages?: ZulipRawMessage[] };
  if (!data || data.result === "error") {
    if (flowDebugLabel != null) {
      logChatListFlow(`api: GET /messages → ${flowDebugLabel} (error payload)`, {
        result: data?.result,
      });
    }
    return [];
  }
  const messages = data.messages ?? [];
  if (flowDebugLabel != null) {
    logChatListFlow(`api: GET /messages → ${flowDebugLabel} (response)`, {
      ...summarizeZulipMessagesForFlowDebug(messages),
    });
  }
  return messages;
}

/** Recent channel messages only (`-is:dm`) for metadata-first stream sidebar preview. */
export async function fetchRecentStreamMessagesForSidebarPreview(
  numBefore = 5000,
  signal?: AbortSignal,
): Promise<ZulipRawMessage[]> {
  const safeNumBefore = validateNonNegativeInteger(
    numBefore,
    "fetchRecentStreamMessagesForSidebarPreview.numBefore",
  );
  return fetchMessageWindow({
    anchor: "newest",
    numBefore: safeNumBefore,
    numAfter: 0,
    narrow: normalizeZulipMessagesNarrowForApi(buildStreamSidebarPreviewNarrow(false)),
    applyMarkdown: false,
    signal,
    flowDebugLabel: "fetchRecentStreamMessagesForSidebarPreview (metadata stream preview)",
  });
}

/** Recent messages in one channel for lazy sidebar topic previews. */
export async function fetchStreamChannelMessagesForSidebarTopics(
  streamId: number,
  numBefore = STREAM_SIDEBAR_TOPIC_HYDRATE_LIMIT,
  signal?: AbortSignal,
): Promise<ZulipRawMessage[]> {
  guard.streamId(streamId, "fetchStreamChannelMessagesForSidebarTopics");
  const safeNumBefore = validateNonNegativeInteger(
    numBefore,
    "fetchStreamChannelMessagesForSidebarTopics.numBefore",
  );
  return fetchMessageWindow({
    anchor: "newest",
    numBefore: safeNumBefore,
    numAfter: ZULIP_STREAM_CHAT_NUM_AFTER,
    narrow: [{ operator: "stream", operand: streamId }],
    applyMarkdown: false,
    signal,
    flowDebugLabel: "fetchStreamChannelMessagesForSidebarTopics (sidebar topic hydrate)",
  });
}

/** Unread channel messages only (`is:unread` + `-is:dm`) for metadata-first stream sidebar preview. */
export async function fetchStreamUnreadMessagesForSidebarPreview(
  numBefore = 5000,
  signal?: AbortSignal,
): Promise<ZulipRawMessage[] | null> {
  const safeNumBefore = validateNonNegativeInteger(
    numBefore,
    "fetchStreamUnreadMessagesForSidebarPreview.numBefore",
  );
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const res = await zulipPipelineGet(
    "/messages",
    {
      anchor: "newest",
      num_before: String(safeNumBefore),
      num_after: "0",
      narrow: JSON.stringify(
        normalizeZulipMessagesNarrowForApi(buildStreamSidebarPreviewNarrow(true)),
      ),
      client_gravatar: "true",
      allow_empty_topic_name: "true",
      apply_markdown: "false",
    },
    signal,
  );
  if (!res?.ok) {
    return null;
  }
  const data = res.data as { result?: string; messages?: ZulipRawMessage[] };
  if (!data || data.result === "error") {
    return null;
  }
  return data.messages ?? [];
}

/** Loads newer chat-list messages after anchor. Used after reconnect. */
export async function fetchMessagesAfterAnchor(
  anchorMessageId: number,
  numAfter = 5000,
  narrow?: MessageWindowOptions["narrow"],
  signal?: AbortSignal,
): Promise<ZulipRawMessage[]> {
  guard.messageId(anchorMessageId, "fetchMessagesAfterAnchor.anchorMessageId");
  return fetchMessageWindow({
    anchor: anchorMessageId,
    numBefore: 0,
    numAfter,
    includeAnchor: false,
    narrow,
    applyMarkdown: false,
    signal,
    flowDebugLabel: "fetchMessagesAfterAnchor (chat list delta / reconnect)",
  });
}

/** Loads a page of all direct messages via `narrow=is:dm` for metadata backfill. */
export async function fetchDirectMessagesPage(
  anchor: number | "newest" = "newest",
  numBefore = 5000,
): Promise<DirectMessagesPageResult> {
  const normalizedAnchor =
    anchor === "newest" ? anchor : guard.messageId(anchor, "fetchDirectMessagesPage.anchor");
  const safeNumBefore = validateNonNegativeInteger(numBefore, "fetchDirectMessagesPage.numBefore");
  logChatListFlow("api: GET /messages → fetchDirectMessagesPage (request)", {
    anchor: normalizedAnchor,
    numBefore: safeNumBefore,
    narrow: "is:dm",
  });
  const res = await zulipPipelineGet("/messages", {
    anchor: String(normalizedAnchor),
    include_anchor: "false",
    num_before: String(safeNumBefore),
    num_after: "0",
    narrow: JSON.stringify([{ operator: "is", operand: "dm" }]),
    client_gravatar: "true",
    allow_empty_topic_name: "true",
    apply_markdown: "false",
  });
  throwIfZulipPipelineGetNull(res);
  if (!res.ok) {
    logChatListFlow("api: GET /messages → fetchDirectMessagesPage (non-ok)", { ok: false });
    return { messages: [], foundOldest: false };
  }
  const data = res.data as {
    result?: string;
    messages?: ZulipRawMessage[];
    found_oldest?: boolean;
    foundOldest?: boolean;
  };
  if (!data || data.result === "error") {
    logChatListFlow("api: GET /messages → fetchDirectMessagesPage (error payload)", {
      result: data?.result,
    });
    return { messages: [], foundOldest: false };
  }
  const dmPageMessages = data.messages ?? [];
  const foundOldest = data.found_oldest ?? data.foundOldest ?? false;
  logChatListFlow("api: GET /messages → fetchDirectMessagesPage (response)", {
    ...summarizeZulipMessagesForFlowDebug(dmPageMessages),
    foundOldest,
  });
  return {
    messages: dmPageMessages,
    foundOldest,
  };
}
