/**
 * Pure helpers for matching messenger messages to the active chat route (stream/topic or DM).
 * Used by the message store and real-time dispatch; must stay aligned with `message-cache-keys.lib`.
 */
import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import { dmConversationKey } from "~/shared/lib/dm-key";
import { normalizeStreamTopicForMessageCache } from "~/shared/lib/message-cache-keys.lib";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import {
  isIamUserUuid,
  isUserIdentityReady,
  type UserId,
  userIdsEqual,
  userIdStorageKey,
} from "~/shared/lib/user-id.lib";
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
  currentUserId: UserId | null,
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
  msg: WorkspaceRawMessage,
  currentUserId: UserId | null,
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
export function parseDmKeyToUserIds(dmKey: string, currentUserId: UserId | null): UserId[] {
  const uniqueByKey = new Map<string, UserId>();
  for (const part of dmKey.split(",")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    if (isIamUserUuid(trimmed)) {
      uniqueByKey.set(userIdStorageKey(trimmed), trimmed.toLowerCase());
      continue;
    }
    const parsed = Number(trimmed);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      uniqueByKey.set(userIdStorageKey(parsed), parsed);
    }
  }
  const uniqueValidIds = Array.from(uniqueByKey.values());
  if (currentUserId == null || !isUserIdentityReady(currentUserId)) {
    return uniqueValidIds;
  }
  const withoutCurrentUser = uniqueValidIds.filter((id) => !userIdsEqual(id, currentUserId));
  return withoutCurrentUser.length > 0 ? withoutCurrentUser : uniqueValidIds;
}
