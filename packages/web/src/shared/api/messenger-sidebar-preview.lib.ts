/**
 * Sidebar chat-list preview helpers backed by the Workspace gateway message-view API.
 */
import { STREAM_SIDEBAR_TOPIC_HYDRATE_LIMIT } from "~/shared/config/metadata-chat-bootstrap.constants";
import { guard } from "~/shared/lib/guards";
import {
  logChatListFlow,
  summarizeMessengerMessagesForFlowDebug,
} from "~/shared/lib/message-flow-debug.lib";
import type { MessageId } from "~/shared/lib/message-id.lib";
import { fetchMyMessagesPage, meMessageToMockMessage } from "./messenger-me-messages";
import { validateNonNegativeInteger } from "./messenger-validation.internal";
import type { DirectMessagesPageResult, WorkspaceRawMessage } from "./messenger.types";

const SIDEBAR_TOPIC_PREVIEW_BACKFILL_CONCURRENCY = 6;

export interface SidebarTopicPreviewTarget {
  topicUuid: string;
  subject: string;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

function streamMessageForSidebar(
  message: Parameters<typeof meMessageToMockMessage>[0],
  options: { streamUuid?: string | null; topicName?: string | null } = {},
): WorkspaceRawMessage {
  const streamUuid = options.streamUuid ?? message.stream_uuid;
  const topicName = options.topicName ?? message.topic_uuid ?? "";
  const mock = meMessageToMockMessage(message, { streamUuid, topicName });
  return {
    ...mock,
    type: "stream",
    display_recipient: streamUuid ?? "",
  };
}

function logMessageResponse(label: string, messages: readonly WorkspaceRawMessage[]): void {
  logChatListFlow(`api: GET /api/workspace/v1/messenger/messages/ → ${label} (response)`, {
    ...summarizeMessengerMessagesForFlowDebug(messages),
  });
}

/** Recent stream messages for metadata-first sidebar preview. */
export async function fetchRecentStreamMessagesForSidebarPreview(
  numBefore = 5000,
  signal?: AbortSignal,
): Promise<WorkspaceRawMessage[]> {
  const safeNumBefore = validateNonNegativeInteger(
    numBefore,
    "fetchRecentStreamMessagesForSidebarPreview.numBefore",
  );
  throwIfAborted(signal);
  logChatListFlow(
    "api: GET /api/workspace/v1/messenger/messages/ → stream sidebar preview (request)",
    {
      limit: safeNumBefore,
      sortDir: "desc",
    },
  );
  const page = await fetchMyMessagesPage({
    limit: safeNumBefore,
    sortKey: "created_at",
    sortDir: "desc",
    signal,
  });
  const messages = [...page.messages].reverse().map((message) => streamMessageForSidebar(message));
  logMessageResponse("stream sidebar preview", messages);
  return messages;
}

/** Recent messages in one channel for lazy sidebar topic previews. */
export async function fetchStreamChannelMessagesForSidebarTopics(
  streamId: string,
  numBefore = STREAM_SIDEBAR_TOPIC_HYDRATE_LIMIT,
  signal?: AbortSignal,
): Promise<WorkspaceRawMessage[]> {
  const streamUuid = guard.streamUuid(streamId, "fetchStreamChannelMessagesForSidebarTopics");
  const safeNumBefore = validateNonNegativeInteger(
    numBefore,
    "fetchStreamChannelMessagesForSidebarTopics.numBefore",
  );
  throwIfAborted(signal);
  logChatListFlow(
    "api: GET /api/workspace/v1/messenger/messages/ → sidebar topic hydrate (request)",
    {
      streamUuid,
      limit: safeNumBefore,
      sortDir: "desc",
    },
  );
  const page = await fetchMyMessagesPage({
    streamUuid,
    limit: safeNumBefore,
    sortKey: "created_at",
    sortDir: "desc",
    signal,
  });
  const messages = [...page.messages]
    .reverse()
    .map((message) => streamMessageForSidebar(message, { streamUuid }));
  logMessageResponse("sidebar topic hydrate", messages);
  return messages;
}

/** Latest message per topic for expanded sidebar rows that only have topic-name shells. */
export async function fetchLatestMessagesForSidebarTopics(
  streamId: string,
  topics: readonly SidebarTopicPreviewTarget[],
  signal?: AbortSignal,
): Promise<WorkspaceRawMessage[]> {
  const streamUuid = guard.streamUuid(streamId, "fetchLatestMessagesForSidebarTopics.streamId");
  const uniqueTopics = Array.from(
    new Map(
      topics
        .map((topic) => ({
          topicUuid: topic.topicUuid.trim().toLowerCase(),
          subject: topic.subject,
        }))
        .filter((topic) => topic.topicUuid.length > 0)
        .map((topic) => [topic.topicUuid, topic]),
    ).values(),
  );
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

      const topic = uniqueTopics[index];
      if (topic == null) {
        return;
      }
      const page = await fetchMyMessagesPage({
        streamUuid,
        topicUuid: topic.topicUuid,
        limit: 1,
        sortKey: "created_at",
        sortDir: "desc",
        signal,
      });
      const latest = page.messages[0];
      if (latest != null) {
        results.push(
          streamMessageForSidebar(latest, {
            streamUuid,
            topicName: topic.subject,
          }),
        );
      }
    }
  });

  await Promise.all(workers);
  logMessageResponse("topic preview backfill", results);
  return results;
}

/** Loads newer chat-list messages after anchor. Used after reconnect. */
export async function fetchMessagesAfterAnchor(
  anchorMessageId: MessageId,
  numAfter = 5000,
  signal?: AbortSignal,
): Promise<WorkspaceRawMessage[]> {
  guard.messageId(anchorMessageId, "fetchMessagesAfterAnchor.anchorMessageId");
  const safeNumAfter = validateNonNegativeInteger(numAfter, "fetchMessagesAfterAnchor.numAfter");
  throwIfAborted(signal);
  logChatListFlow("api: GET /api/workspace/v1/messenger/messages/ → chat list delta (request)", {
    marker: anchorMessageId,
    limit: safeNumAfter,
    sortDir: "asc",
  });
  const page = await fetchMyMessagesPage({
    limit: safeNumAfter,
    marker: anchorMessageId,
    sortKey: "created_at",
    sortDir: "asc",
    signal,
  });
  const messages = page.messages.map((message) => streamMessageForSidebar(message));
  logMessageResponse("chat list delta", messages);
  return messages;
}

/** Direct-message backfill is not available in the stream-only backend. */
export function fetchDirectMessagesPage(
  anchor: MessageId = "newest",
  numBefore = 5000,
): Promise<DirectMessagesPageResult> {
  const normalizedAnchor =
    anchor === "newest" ? anchor : guard.messageId(anchor, "fetchDirectMessagesPage.anchor");
  const safeNumBefore = validateNonNegativeInteger(numBefore, "fetchDirectMessagesPage.numBefore");
  logChatListFlow("api: fetchDirectMessagesPage skipped (stream-only backend)", {
    anchor: normalizedAnchor,
    numBefore: safeNumBefore,
  });
  return Promise.resolve({ messages: [], foundOldest: true });
}
