/**
 * Pure chat sorting logic — no store dependencies.
 *
 * Accepts all required data as parameters so it can live in shared/lib/
 * without importing feature or entity stores.
 */
import { buildTimestampedSidebarChats } from "~/shared/lib/chat-sorting-build.lib";
import { compareChatsByActivity } from "~/shared/lib/chat-sorting-compare.lib";
import { loadRecentDmPartners } from "~/shared/lib/recent-dms";
import type {
  SidebarChat,
  StreamEntryInternal,
  DmEntryInternal,
} from "~/shared/types/sidebar-chat";

export type { ChatSortingOptions } from "./chat-sorting-compare.lib";

import type { ChatSortingOptions } from "./chat-sorting-compare.lib";

interface TimestampedChat {
  c: SidebarChat;
  ts: number;
}

function compareChatsAlphabetical(a: TimestampedChat, b: TimestampedChat): number {
  return a.c.name.localeCompare(b.c.name);
}

export function sortChatsByLastMessage(
  streamsMap: Map<number, StreamEntryInternal>,
  dmsMap: Map<string, DmEntryInternal>,
  sorting: string,
  muteSet: Set<number>,
  options: ChatSortingOptions = {},
): SidebarChat[] {
  const prioritizePersonalUnread = options.prioritizePersonalUnread ?? false;
  const prioritizeUnmutedUnreadChannels = options.prioritizeUnmutedUnreadChannels ?? false;
  const hideUnknownArchivedStreams = options.hideUnknownArchivedStreams ?? false;
  const withTs = buildTimestampedSidebarChats(streamsMap, dmsMap, hideUnknownArchivedStreams);

  const recentDmIds = loadRecentDmPartners();
  const resolvedOptions: Required<ChatSortingOptions> = {
    prioritizePersonalUnread,
    prioritizeUnmutedUnreadChannels,
    hideUnknownArchivedStreams,
  };

  if (sorting === "alphabetical") {
    withTs.sort(compareChatsAlphabetical);
  } else {
    withTs.sort((a, b) => compareChatsByActivity(a, b, recentDmIds, resolvedOptions, muteSet));
  }

  return withTs.map((x) => x.c);
}
