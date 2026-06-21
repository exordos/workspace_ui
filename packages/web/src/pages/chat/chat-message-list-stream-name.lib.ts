import type { MockMessage } from "~/shared/api/messenger.types";

export function resolveStreamNameForPermalink(
  streams: readonly { stream_uuid: string; name: string }[],
  streamId: string,
): string | undefined {
  return streams.find((stream) => stream.stream_uuid === streamId)?.name;
}

export function buildReplyPermalinkStreamNameResolver(
  streams: readonly { stream_uuid: string; name: string }[],
): (streamId: string) => string | undefined {
  return (streamId) => resolveStreamNameForPermalink(streams, streamId);
}

export type ReplyQuoteMessage = Pick<
  MockMessage,
  "id" | "content" | "sender_full_name" | "sender_id"
>;
