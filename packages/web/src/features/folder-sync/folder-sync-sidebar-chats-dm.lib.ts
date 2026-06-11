import { dmRouteKey } from "~/shared/lib/dm-key";
import type { SidebarChat } from "~/shared/types/sidebar-chat";
import { parseFolderItemDmUserIds } from "./folder-sync-chat-id.lib";

function parseDmSlugToUserIds(dmSlug: string): number[] {
  return (
    parseFolderItemDmUserIds(`dm:${dmSlug}`) ??
    dmSlug
      .split(",")
      .map((part) => part.split("-")[0]?.trim() ?? "")
      .map((rawUserId) => {
        if (!/^\d+$/.test(rawUserId)) return null;
        const parsed = Number(rawUserId);
        if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
        return parsed;
      })
      .filter((userId): userId is number => userId !== null)
  );
}

function resolveSidebarDmUserIds(chat: Extract<SidebarChat, { type: "dm" }>): number[] {
  if (Array.isArray(chat.userIds) && chat.userIds.length > 0) {
    return chat.userIds;
  }
  return parseDmSlugToUserIds(chat.slug);
}

function canonicalDmSidebarKey(
  chat: Extract<SidebarChat, { type: "dm" }>,
  currentUserId: number | null,
): string {
  return dmRouteKey(resolveSidebarDmUserIds(chat), currentUserId);
}

function dmSidebarActivityTs(chat: Extract<SidebarChat, { type: "dm" }>): number {
  return chat.ts ?? 0;
}

function pickRicherDmSidebarChat(
  left: Extract<SidebarChat, { type: "dm" }>,
  right: Extract<SidebarChat, { type: "dm" }>,
): Extract<SidebarChat, { type: "dm" }> {
  const leftTs = dmSidebarActivityTs(left);
  const rightTs = dmSidebarActivityTs(right);
  if (leftTs !== rightTs) {
    return leftTs > rightTs ? left : right;
  }
  const leftUserIds = left.userIds?.length ?? 0;
  const rightUserIds = right.userIds?.length ?? 0;
  if (leftUserIds !== rightUserIds) {
    return leftUserIds > rightUserIds ? left : right;
  }
  return (left.lastMessage?.length ?? 0) >= (right.lastMessage?.length ?? 0) ? left : right;
}

/** Collapses duplicate DM rows that share the same participant set (e.g. `20,30` vs `10,20,30`). */
export function dedupeSidebarDmChats(
  chats: readonly SidebarChat[],
  currentUserId: number | null,
): SidebarChat[] {
  const result: SidebarChat[] = [];
  const dmIndexByKey = new Map<string, number>();

  for (const chat of chats) {
    if (chat.type !== "dm") {
      result.push(chat);
      continue;
    }

    const key = canonicalDmSidebarKey(chat, currentUserId);
    const existingIndex = dmIndexByKey.get(key);
    if (existingIndex == null) {
      dmIndexByKey.set(key, result.length);
      result.push(chat);
      continue;
    }

    const existing = result[existingIndex];
    if (existing?.type === "dm") {
      result[existingIndex] = pickRicherDmSidebarChat(existing, chat);
    }
  }

  return result;
}

// Self-DM belongs in "My activity", not the regular chat list.
function isSelfDmChat(chat: SidebarChat, currentUserId: number | null): boolean {
  if (chat.type !== "dm") return false;
  if (chat.isGroup === true) return false;
  if (currentUserId == null) return false;
  return chat.id === currentUserId;
}

// Self-DMs must not appear in sidebar chat projection.
function shouldHideDmChat(chat: SidebarChat, currentUserId: number | null): boolean {
  if (chat.type !== "dm") return false;
  return isSelfDmChat(chat, currentUserId);
}

// Apply hide rules uniformly across all chat-list build paths.
export function filterHiddenDmChats(
  chats: readonly SidebarChat[],
  currentUserId: number | null,
): SidebarChat[] {
  const visible = chats.filter((chat) => !shouldHideDmChat(chat, currentUserId));
  return dedupeSidebarDmChats(visible, currentUserId);
}
