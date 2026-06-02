/**
 * Pinned chat ordering for sidebar lists — O(M) alias index build + O(N) partition.
 */

import {
  addChatIdAliases,
  chatToWorkspaceChatId,
} from "~/features/folder-sync/folder-sync-chat-id.lib";
import type { SidebarChat } from "~/shared/types/sidebar-chat";

/** Maps chat_id aliases to pinned sort index (0 = top). Built once per sorted pinned id list. */
export function buildPinnedChatSortIndexLookup(
  pinnedChatIdsSorted: readonly string[],
): Map<string, number> {
  const indexByAlias = new Map<string, number>();
  for (let index = 0; index < pinnedChatIdsSorted.length; index++) {
    const pinnedChatId = pinnedChatIdsSorted[index]?.trim();
    if (pinnedChatId == null || pinnedChatId.length === 0) {
      continue;
    }
    const aliases = new Set<string>();
    addChatIdAliases(aliases, pinnedChatId);
    for (const alias of aliases) {
      if (!indexByAlias.has(alias)) {
        indexByAlias.set(alias, index);
      }
    }
  }
  return indexByAlias;
}

/** Returns pinned sort index for chatId, or -1 if not pinned. */
export function lookupPinnedSortIndex(
  sortIndexByAlias: ReadonlyMap<string, number>,
  chatId: string,
): number {
  const aliases = new Set<string>();
  addChatIdAliases(aliases, chatId);
  let bestIndex = -1;
  for (const alias of aliases) {
    const index = sortIndexByAlias.get(alias);
    if (index !== undefined && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index;
    }
  }
  return bestIndex;
}

export interface OrderChatsWithPinnedFirstOptions {
  isMuted?: (chat: SidebarChat) => boolean;
}

function orderChatsPartitionWithPinnedFirst(
  chats: readonly SidebarChat[],
  sortIndexByAlias: ReadonlyMap<string, number>,
): SidebarChat[] {
  const pinnedEntries: { chat: SidebarChat; order: number }[] = [];
  const regularChats: SidebarChat[] = [];

  for (const chat of chats) {
    const order = lookupPinnedSortIndex(sortIndexByAlias, chatToWorkspaceChatId(chat));
    if (order >= 0) {
      pinnedEntries.push({ chat, order });
    } else {
      regularChats.push(chat);
    }
  }

  pinnedEntries.sort((left, right) => left.order - right.order);
  return [...pinnedEntries.map((entry) => entry.chat), ...regularChats];
}

/** Pinned chats first (by pin order), then unpinned — preserves relative order within each group. */
export function orderChatsWithPinnedFirst(
  chats: readonly SidebarChat[],
  pinnedChatIdsSorted: readonly string[],
  options: OrderChatsWithPinnedFirstOptions = {},
): SidebarChat[] {
  if (pinnedChatIdsSorted.length === 0) {
    return [...chats];
  }

  const sortIndexByAlias = buildPinnedChatSortIndexLookup(pinnedChatIdsSorted);
  if (options.isMuted == null) {
    return orderChatsPartitionWithPinnedFirst(chats, sortIndexByAlias);
  }

  const unmutedChats: SidebarChat[] = [];
  const mutedChats: SidebarChat[] = [];
  for (const chat of chats) {
    if (options.isMuted(chat)) {
      mutedChats.push(chat);
    } else {
      unmutedChats.push(chat);
    }
  }

  return [
    ...orderChatsPartitionWithPinnedFirst(unmutedChats, sortIndexByAlias),
    ...orderChatsPartitionWithPinnedFirst(mutedChats, sortIndexByAlias),
  ];
}
