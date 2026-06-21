import { userIdsEqual, type UserId } from "~/shared/lib/user-id.lib";
import type { SidebarChat } from "~/shared/types/sidebar-chat";

// Self-DM belongs in "My activity", not the regular chat list.
function isSelfDmChat(chat: SidebarChat, currentUserId: UserId | null): boolean {
  if (chat.type !== "dm") return false;
  if (currentUserId == null) return false;
  return userIdsEqual(chat.id, currentUserId);
}

// Self-DMs must not appear in sidebar chat projection.
function shouldHideDmChat(chat: SidebarChat, currentUserId: UserId | null): boolean {
  return isSelfDmChat(chat, currentUserId);
}

// Apply hide rules uniformly across all chat-list build paths.
export function filterHiddenDmChats(
  chats: readonly SidebarChat[],
  currentUserId: UserId | null,
): SidebarChat[] {
  return chats.filter((chat) => !shouldHideDmChat(chat, currentUserId));
}
