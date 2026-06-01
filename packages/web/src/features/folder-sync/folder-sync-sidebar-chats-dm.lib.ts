import type { SidebarChat } from "~/shared/types/sidebar-chat";

// Зачем: self-DM должен быть доступен только из «Моя активность», а не в обычном списке чатов.
// Что делает: определяет, является ли конкретный DM персональным чатом пользователя с самим собой.
function isSelfDmChat(chat: SidebarChat, currentUserId: number | null): boolean {
  if (chat.type !== "dm") return false;
  if (chat.isGroup === true) return false;
  if (currentUserId == null) return false;
  return chat.id === currentUserId;
}

// Зачем: групповые DM и self-DM не должны попадать в sidebar-проекцию чатов.
// Что делает: возвращает true для DM-чатов, которые нужно скрыть из сайдбара.
function shouldHideDmChat(chat: SidebarChat, currentUserId: number | null): boolean {
  if (chat.type !== "dm") return false;
  if (chat.isGroup === true) return true;
  return isSelfDmChat(chat, currentUserId);
}

// Зачем: правило скрытия должно применяться единообразно для всех путей построения списка чатов.
// Что делает: удаляет из входного массива все DM, отмеченные как скрываемые.
export function filterHiddenDmChats(
  chats: readonly SidebarChat[],
  currentUserId: number | null,
): SidebarChat[] {
  return chats.filter((chat) => !shouldHideDmChat(chat, currentUserId));
}
