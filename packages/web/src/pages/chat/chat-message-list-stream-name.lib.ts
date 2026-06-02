import type { MockMessage } from "~/shared/api/zulip.types";

export function resolveStreamNameForPermalink(
  streams: readonly { stream_id: number; name: string }[],
  streamId: number,
): string | undefined {
  return streams.find((stream) => stream.stream_id === streamId)?.name;
}

export function buildReplyPermalinkStreamNameResolver(
  streams: readonly { stream_id: number; name: string }[],
): (streamId: number) => string | undefined {
  return (streamId) => resolveStreamNameForPermalink(streams, streamId);
}

export type ReplyQuoteMessage = Pick<
  MockMessage,
  "id" | "content" | "sender_full_name" | "sender_id"
>;
