/**
 * Sidebar chat-list preview and DM backfill via GET /messages.
 *
 * Metadata-first stream sidebar preview, per-channel topic hydrate,
 * unread stream snapshots, reconnect deltas, and DM page backfill.
 *
 * Usage:
 *   import { fetchRecentStreamMessagesForSidebarPreview } from "~/shared/api/messenger-sidebar-preview.lib";
 */
import { STREAM_SIDEBAR_TOPIC_HYDRATE_LIMIT } from "~/shared/config/metadata-chat-bootstrap.constants";
import { guard } from "~/shared/lib/guards";
import {
  logChatListFlow,
  summarizeMessengerMessagesForFlowDebug,
} from "~/shared/lib/message-flow-debug.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { MESSENGER_STREAM_CHAT_NUM_AFTER } from "~/shared/lib/messenger-message-window.lib";
import { buildStreamSidebarPreviewNarrow } from "~/shared/lib/messenger-stream-sidebar-preview-narrow.lib";
import {
  normalizeMessengerMessagesNarrowForApi,
  type MessengerMessagesNarrowClause,
} from "~/shared/lib/messenger-topic-narrow.lib";
import { messengerPipelineGet } from "./messenger-pipeline.internal";
import { validateNonNegativeInteger } from "./messenger-validation.internal";
import type { DirectMessagesPageResult, WorkspaceRawMessage } from "./messenger.types";

interface MessageWindowOptions {
  anchor: string;
  numBefore: number;
  numAfter: number;
  includeAnchor?: boolean;
  narrow?: MessengerMessagesNarrowClause[];
  applyMarkdown?: boolean;
  signal?: AbortSignal;
  /** When set and chat-list pipeline trace is enabled, logs GET /messages for sidebar bootstrap. */
  flowDebugLabel?: string;
}

const SIDEBAR_TOPIC_PREVIEW_BACKFILL_CONCURRENCY = 6;

// `messengerPipelineGet` returns null on network failure unless aborted.
// Message loaders must throw so callers surface errors instead of treating [] as success.
function throwIfWorkspacePipelineGetNull(
  response: { ok: boolean; status: number; data: unknown } | null,
  signal?: AbortSignal,
): asserts response is { ok: boolean; status: number; data: unknown } {
  if (response != null) return;
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  throw new Error("Workspace request failed");
}

async function fetchMessageWindow(options: MessageWindowOptions): Promise<WorkspaceRawMessage[]> {
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
  const res = await messengerPipelineGet(
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
  throwIfWorkspacePipelineGetNull(res, signal);
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (!res.ok) {
    if (flowDebugLabel != null) {
      logChatListFlow(`api: GET /messages → ${flowDebugLabel} (non-ok)`, { ok: false });
    }
    return [];
  }
  const data = res.data as { result?: string; messages?: WorkspaceRawMessage[] };
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
      ...summarizeMessengerMessagesForFlowDebug(messages),
    });
  }
  return messages;
}

/** Recent channel messages only (`-is:dm`) for metadata-first stream sidebar preview. */
export async function fetchRecentStreamMessagesForSidebarPreview(
  numBefore = 5000,
  signal?: AbortSignal,
): Promise<WorkspaceRawMessage[]> {
  const safeNumBefore = validateNonNegativeInteger(
    numBefore,
    "fetchRecentStreamMessagesForSidebarPreview.numBefore",
  );
  return fetchMessageWindow({
    anchor: "newest",
    numBefore: safeNumBefore,
    numAfter: 0,
    narrow: normalizeMessengerMessagesNarrowForApi(buildStreamSidebarPreviewNarrow(false)),
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
): Promise<WorkspaceRawMessage[]> {
  guard.streamId(streamId, "fetchStreamChannelMessagesForSidebarTopics");
  const safeNumBefore = validateNonNegativeInteger(
    numBefore,
    "fetchStreamChannelMessagesForSidebarTopics.numBefore",
  );
  return fetchMessageWindow({
    anchor: "newest",
    numBefore: safeNumBefore,
    numAfter: MESSENGER_STREAM_CHAT_NUM_AFTER,
    narrow: [{ operator: "stream", operand: streamId }],
    applyMarkdown: false,
    signal,
    flowDebugLabel: "fetchStreamChannelMessagesForSidebarTopics (sidebar topic hydrate)",
  });
}

/** Latest message per topic for expanded sidebar rows that only have topic-name shells. */
export async function fetchLatestMessagesForSidebarTopics(
  streamId: number,
  topics: readonly string[],
  signal?: AbortSignal,
): Promise<WorkspaceRawMessage[]> {
  guard.streamId(streamId, "fetchLatestMessagesForSidebarTopics.streamId");
  const uniqueTopics = Array.from(new Set(topics));
  if (uniqueTopics.length === 0) {
    return [];
  }

  const results: WorkspaceRawMessage[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(SIDEBAR_TOPIC_PREVIEW_BACKFILL_CONCURRENCY, uniqueTopics.length);

  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= uniqueTopics.length) {
        return;
      }

      const topic = uniqueTopics[index] ?? "";
      const messages = await fetchMessageWindow({
        anchor: "newest",
        numBefore: 1,
        numAfter: 0,
        narrow: normalizeMessengerMessagesNarrowForApi([
          { operator: "stream", operand: streamId },
          { operator: "topic", operand: topic },
        ]),
        applyMarkdown: false,
        signal,
        flowDebugLabel: "fetchLatestMessagesForSidebarTopics (topic preview backfill)",
      });
      const latest = messages[messages.length - 1];
      if (latest != null) {
        results.push(latest);
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/** Unread channel messages only (`is:unread` + `-is:dm`) for metadata-first stream sidebar preview. */
export async function fetchStreamUnreadMessagesForSidebarPreview(
  numBefore = 5000,
  signal?: AbortSignal,
): Promise<WorkspaceRawMessage[] | null> {
  const safeNumBefore = validateNonNegativeInteger(
    numBefore,
    "fetchStreamUnreadMessagesForSidebarPreview.numBefore",
  );
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const res = await messengerPipelineGet(
    "/messages",
    {
      anchor: "newest",
      num_before: String(safeNumBefore),
      num_after: "0",
      narrow: JSON.stringify(
        normalizeMessengerMessagesNarrowForApi(buildStreamSidebarPreviewNarrow(true)),
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
  const data = res.data as { result?: string; messages?: WorkspaceRawMessage[] };
  if (!data || data.result === "error") {
    return null;
  }
  return data.messages ?? [];
}

/** Loads newer chat-list messages after anchor. Used after reconnect. */
export async function fetchMessagesAfterAnchor(
  anchorMessageId: MessageId,
  numAfter = 5000,
  narrow?: MessageWindowOptions["narrow"],
  signal?: AbortSignal,
): Promise<WorkspaceRawMessage[]> {
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
  anchor: MessageId = "newest",
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
  const res = await messengerPipelineGet("/messages", {
    anchor: String(normalizedAnchor),
    include_anchor: "false",
    num_before: String(safeNumBefore),
    num_after: "0",
    narrow: JSON.stringify([{ operator: "is", operand: "dm" }]),
    client_gravatar: "true",
    allow_empty_topic_name: "true",
    apply_markdown: "false",
  });
  throwIfWorkspacePipelineGetNull(res);
  if (!res.ok) {
    logChatListFlow("api: GET /messages → fetchDirectMessagesPage (non-ok)", { ok: false });
    return { messages: [], foundOldest: false };
  }
  const data = res.data as {
    result?: string;
    messages?: WorkspaceRawMessage[];
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
    ...summarizeMessengerMessagesForFlowDebug(dmPageMessages),
    foundOldest,
  });
  return {
    messages: dmPageMessages,
    foundOldest,
  };
}
