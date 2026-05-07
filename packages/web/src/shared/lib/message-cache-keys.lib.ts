/**
 * Deterministic chat keys for IndexedDB partitioning (instance + conversation).
 *
 * Must stay aligned with routing and `isMessageForContext` matching.
 *
 * Usage:
 *   import { chatKeyFromContext, instanceChatKey } from "~/shared/lib/message-cache-keys.lib";
 */
import type { MockMessage, ZulipRawMessage } from "~/shared/api/zulip.types";
import { dmConversationKey } from "~/shared/lib/dm-key";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";

/** Narrow context shape for cache keys (compatible with `CurrentChatContext`). */
export type MessageCacheChatContext =
  | { type: "stream"; streamId: number; topic: string }
  | { type: "dm"; dmKey: string };

/** Align with `chatKeyFromRawMessage` / Zulip topic identity normalization. */
export function normalizeStreamTopicForMessageCache(topic: string): string {
  return normalizeTopicForIdentity(topic);
}

export function chatKeyFromContext(context: MessageCacheChatContext): string {
  if (context.type === "stream") {
    const topic = normalizeStreamTopicForMessageCache(context.topic);
    return `stream:${context.streamId}:${topic}`;
  }
  return `dm:${context.dmKey}`;
}

export function chatKeyFromRawMessage(
  raw: ZulipRawMessage,
  currentUserId: number | null,
): string | null {
  if (raw.type === "stream" && raw.stream_id != null) {
    const topic = normalizeTopicForIdentity(raw.subject ?? "");
    return `stream:${raw.stream_id}:${topic}`;
  }
  if (raw.type === "private" && Array.isArray(raw.display_recipient)) {
    return `dm:${dmConversationKey(raw.display_recipient, currentUserId)}`;
  }
  return null;
}

export function chatKeyFromMockMessage(
  msg: MockMessage,
  currentUserId: number | null,
): string | null {
  if (msg.stream_id != null) {
    const topic = normalizeTopicForIdentity(msg.subject ?? "");
    return `stream:${msg.stream_id}:${topic}`;
  }
  if (Array.isArray(msg.display_recipient)) {
    return `dm:${dmConversationKey(msg.display_recipient, currentUserId)}`;
  }
  return null;
}

export function instanceChatKey(instanceId: string, chatKey: string): string {
  return `${instanceId}::${chatKey}`;
}
