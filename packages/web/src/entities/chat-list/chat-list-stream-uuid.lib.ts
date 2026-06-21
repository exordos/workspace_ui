/**
 * Resolves the gateway `stream_uuid` for an active chat context so messages can be fetched from the
 * `/messages/` endpoint. Channels resolve via stream metadata (`streamsMap`); DMs via the
 * private-stream uuid carried on the DM sidebar entry — either because the route slug / `dmKey`
 * segment is itself the stream uuid (sidebar slug == streamUuid), or by matching the peer identity.
 */
import { parseDmKeyToUserIds } from "~/entities/message/message-chat-context.lib";
import type { CurrentChatContext } from "~/entities/message/message.model.types";
import { type UserId, userIdsEqual, userIdStorageKey } from "~/shared/lib/user-id.lib";
import type { DmEntryInternal, StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { useChatListStore } from "./chat-list.model";

export interface ChatListUuidMaps {
  streamsMap: Map<string, StreamEntryInternal>;
  dmsMap: Map<string, DmEntryInternal>;
}

const DM_STREAM_KEY_PREFIX = "stream:";

function peerSetsEqual(left: readonly UserId[], right: readonly UserId[]): boolean {
  if (left.length !== right.length || left.length === 0) {
    return false;
  }
  const rightKeys = new Set(right.map(userIdStorageKey));
  return left.every((id) => rightKeys.has(userIdStorageKey(id)));
}

function resolveDmStreamUuid(
  dmKey: string,
  currentUserId: UserId | null,
  dmsMap: Map<string, DmEntryInternal>,
): string | null {
  // Fast path: a dmKey segment is itself the private-stream uuid (sidebar slug == streamUuid).
  for (const segment of dmKey.split(",")) {
    const candidate = segment.trim().toLowerCase();
    if (candidate.length === 0) continue;
    if (dmsMap.has(`${DM_STREAM_KEY_PREFIX}${candidate}`)) {
      return candidate;
    }
  }
  // Fallback: match the conversation peers against DM entries carrying a private-stream uuid.
  const peers = parseDmKeyToUserIds(dmKey, currentUserId);
  if (peers.length === 0) {
    return null;
  }
  for (const entry of dmsMap.values()) {
    if (entry.streamUuid == null) continue;
    if (entry.userUuid != null && peers.some((peer) => userIdsEqual(peer, entry.userUuid!))) {
      return entry.streamUuid;
    }
    const entryPeers = (entry.userIds ?? []).filter(
      (id) => currentUserId == null || !userIdsEqual(id, currentUserId),
    );
    if (peerSetsEqual(peers, entryPeers)) {
      return entry.streamUuid;
    }
  }
  return null;
}

/** Pure resolver over explicit chat-list maps (testable without the store). */
export function resolveStreamUuidForContext(
  context: CurrentChatContext,
  currentUserId: UserId | null,
  maps: ChatListUuidMaps,
): string | null {
  if (context.type === "stream") {
    const streamUuid = String(context.streamId).trim().toLowerCase();
    if (streamUuid.length > 0) {
      return streamUuid;
    }
    return null;
  }
  return resolveDmStreamUuid(context.dmKey, currentUserId, maps.dmsMap);
}

/** Resolver reading the live chat-list store. */
export function getStreamUuidForContext(
  context: CurrentChatContext,
  currentUserId: UserId | null,
): string | null {
  const { streamsMap, dmsMap } = useChatListStore.getState();
  return resolveStreamUuidForContext(context, currentUserId, { streamsMap, dmsMap });
}
