/**
 * Unified chat message-page fetch.
 *
 * Resolves the chat's gateway `stream_uuid` and loads a page from the `/me/messages/` endpoint
 * (marker pagination), returning the legacy {@link MessagesPageResult} shape so it is a drop-in for
 * the store's initial load and older/newer boundary pagination. Chats without a resolvable stream
 * uuid (legacy or not-yet-bootstrapped) fall back to the narrow `/messages` fetch.
 */
import { getStreamUuidForContext } from "~/entities/chat-list/chat-list-stream-uuid.lib";
import { fetchStreamMessagesPage } from "~/shared/api/messenger-me-messages";
import { fetchMessagesWithNarrowPage } from "~/shared/api/messenger-messages";
import type { MessagesPageResult } from "~/shared/api/messenger.types";
import { createLogger } from "~/shared/lib/logger";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import { buildMessageFetchNarrow } from "./message-chat-context.lib";
import type { CurrentChatContext } from "./message.model.types";

const log = createLogger("message-fetch");

export interface FetchChatMessagesPageArgs {
  context: CurrentChatContext;
  currentUserId: UserId | null;
  /** A message uuid pages relative to it; the `"newest"` sentinel loads the latest window. */
  anchor: MessageId;
  numBefore: number;
  numAfter: number;
  signal?: AbortSignal;
}

export async function fetchChatMessagesPage(
  args: FetchChatMessagesPageArgs,
): Promise<MessagesPageResult> {
  const streamUuid = getStreamUuidForContext(args.context, args.currentUserId);
  if (streamUuid != null) {
    return fetchStreamMessagesPage({
      streamUuid,
      streamId: args.context.type === "stream" ? args.context.streamId : null,
      anchor: args.anchor,
      numBefore: args.numBefore,
      numAfter: args.numAfter,
      signal: args.signal,
    });
  }

  log.warn("no gateway stream uuid for context; falling back to narrow message fetch", {
    contextType: args.context.type,
  });
  return fetchMessagesWithNarrowPage(
    buildMessageFetchNarrow(args.context, args.currentUserId),
    args.anchor,
    args.numBefore,
    args.numAfter,
    { applyMarkdown: false, signal: args.signal },
  );
}
