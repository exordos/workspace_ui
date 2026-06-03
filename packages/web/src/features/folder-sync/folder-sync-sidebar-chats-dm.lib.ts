import type { SidebarChat } from "~/shared/types/sidebar-chat";

// Self-DM belongs in "My activity", not the regular chat list.
function isSelfDmChat(chat: SidebarChat, currentUserId: number | null): boolean {
  if (chat.type !== "dm") return false;
  if (chat.isGroup === true) return false;
  if (currentUserId == null) return false;
  return chat.id === currentUserId;
}

// Group DMs and self-DMs must not appear in sidebar chat projection.
function shouldHideDmChat(chat: SidebarChat, currentUserId: number | null): boolean {
  if (chat.type !== "dm") return false;
  if (chat.isGroup === true) return true;
  return isSelfDmChat(chat, currentUserId);
}

// Apply hide rules uniformly across all chat-list build paths.
export function filterHiddenDmChats(
  chats: readonly SidebarChat[],
  currentUserId: number | null,
): SidebarChat[] {
  return chats.filter((chat) => !shouldHideDmChat(chat, currentUserId));
}
