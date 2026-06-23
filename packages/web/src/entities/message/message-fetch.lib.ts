/**
 * Unified chat message-page fetch.
 *
 * Resolves the chat gateway `stream_uuid` and loads a page from the `/messages/` endpoint
 * (marker pagination), returning the existing MessagesPageResult shape for the store.
 * Chats without a resolvable stream uuid fail fast instead of calling stream message endpoints.
 */
import { getStreamUuidForContext } from "~/entities/chat-list/chat-list-stream-uuid.lib";
import { fetchStreamMessagesPage } from "~/shared/api/messenger-me-messages";
import type { MessagesPageResult } from "~/shared/api/messenger.types";
import { createLogger } from "~/shared/lib/logger";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
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
      ...(args.context.type === "stream" && args.context.topicUuid != null
        ? { topicUuid: args.context.topicUuid }
        : {}),
      ...(args.context.type === "stream" ? { topicName: args.context.topic } : {}),
      anchor: args.anchor,
      numBefore: args.numBefore,
      numAfter: args.numAfter,
      signal: args.signal,
    });
  }

  log.warn("no gateway stream uuid for context", {
    contextType: args.context.type,
  });
  throw new Error("Missing stream uuid for chat context");
}
