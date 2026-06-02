/**
 * Pure helpers for matching Zulip messages to the active chat route (stream/topic or DM).
 * Used by the message store and real-time dispatch; must stay aligned with `message-cache-keys.lib`.
 */
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { dmConversationKey } from "~/shared/lib/dm-key";
import { normalizeStreamTopicForMessageCache } from "~/shared/lib/message-cache-keys.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import type { CurrentChatContext } from "./message.model.types";

/** True when route points to the same stream/topic or DM as the current store context (re-sync without navigation). */
export function isSameChatLocation(
  prev: CurrentChatContext | null,
  next: CurrentChatContext | null,
): boolean {
  if (prev == null || next == null) return false;
  if (prev.type !== next.type) return false;
  if (prev.type === "stream" && next.type === "stream") {
    if (prev.streamId !== next.streamId) return false;
    if (prev.streamWideView === true && next.streamWideView === true) return true;
    const pt = normalizeStreamTopicForMessageCache(prev.topic);
    const nt = normalizeStreamTopicForMessageCache(next.topic);
    if (pt === nt) return true;
    return pt.toLowerCase() === nt.toLowerCase();
  }
  if (prev.type === "dm" && next.type === "dm") {
    return prev.dmKey === next.dmKey;
  }
  return false;
}

export function isMessageForContext(
  msg: {
    type?: string;
    stream_id?: number | null;
    subject?: string;
    display_recipient?: string | { id: number }[];
  },
  context: CurrentChatContext | null,
  currentUserId: number | null,
): boolean {
  if (!context) return false;
  if (context.type === "stream") {
    if (msg.type !== "stream" || msg.stream_id !== context.streamId) return false;
    if (context.streamWideView) return true;
    return (
      normalizeStreamTopicForMessageCache(normalizeTopicForIdentity(msg.subject ?? "")) ===
      normalizeStreamTopicForMessageCache(context.topic)
    );
  }
  if (context.type === "dm") {
    if (msg.type !== "private" || !Array.isArray(msg.display_recipient)) return false;
    const key = dmConversationKey(msg.display_recipient, currentUserId);
    return key === context.dmKey;
  }
  return false;
}

export function contextFromMessage(
  msg: ZulipRawMessage,
  currentUserId: number | null,
): CurrentChatContext | null {
  if (msg.type === "stream" && msg.stream_id != null) {
    const name =
      typeof msg.display_recipient === "string" ? msg.display_recipient : String(msg.stream_id);
    const topic = normalizeTopicForIdentity(msg.subject ?? "");
    return { type: "stream", streamId: msg.stream_id, streamName: name, topic };
  }
  if (msg.type === "private" && Array.isArray(msg.display_recipient)) {
    const dmKey = dmConversationKey(msg.display_recipient, currentUserId);
    return { type: "dm", dmKey };
  }
  return null;
}

/** Parse DM key string into participant user ids (excluding current user when possible). */
export function buildMessageFetchNarrow(
  context: CurrentChatContext,
  currentUserId: number | null,
): { operator: string; operand: string | number | number[] }[] {
  if (context.type === "stream") {
    if (context.streamWideView) {
      return [{ operator: "stream", operand: context.streamName }];
    }
    return [
      { operator: "stream", operand: context.streamName },
      { operator: "topic", operand: context.topic },
    ];
  }
  return [{ operator: "dm", operand: parseDmKeyToUserIds(context.dmKey, currentUserId) }];
}

export function parseDmKeyToUserIds(dmKey: string, currentUserId: number | null): number[] {
  const parts = dmKey
    .split(",")
    .map((p) => Number(p))
    .filter((n) => Number.isSafeInteger(n) && n > 0);
  const uniqueValidIds = Array.from(new Set(parts));
  if (currentUserId == null) return uniqueValidIds;
  const withoutCurrentUser = uniqueValidIds.filter((id) => id !== currentUserId);
  return withoutCurrentUser.length > 0 ? withoutCurrentUser : uniqueValidIds;
}
