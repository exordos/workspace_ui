import type { SidebarChat } from "~/shared/types/sidebar-chat";

export interface FolderSyncUserLike {
  full_name?: string;
  email?: string;
}

export function parseNumericChatId(chatId: string): number | null {
  const trimmed = chatId.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseStreamChatId(chatId: string): { streamId: number; topic: string | null } | null {
  const [kind, streamIdRaw, ...topicParts] = chatId.split(":");
  if (kind !== "stream" || streamIdRaw == null || streamIdRaw.length === 0) {
    return null;
  }
  const streamId = Number(streamIdRaw);
  if (!Number.isSafeInteger(streamId) || streamId <= 0) {
    return null;
  }
  const topic = topicParts.length > 0 ? topicParts.join(":") : null;
  return { streamId, topic };
}

function normalizeStreamTopic(topic: string | null): string {
  if (topic == null) return "general";
  const trimmedTopic = topic.trim();
  if (trimmedTopic.length === 0) return "general";
  if (trimmedTopic.toLowerCase() === "general") return "general";
  return trimmedTopic;
}

function parseDmChatUserIds(chatId: string): number[] | null {
  const dmMatch = /^dm:(\d+(?:,\d+)*)$/.exec(chatId.trim());
  const rawUserIds = dmMatch?.[1];
  if (!rawUserIds) {
    return null;
  }
  const parsed = rawUserIds
    .split(",")
    .map((rawUserId) => Number(rawUserId))
    .filter((userId) => Number.isSafeInteger(userId) && userId > 0);
  if (parsed.length === 0) {
    return null;
  }
  return [...parsed].sort((left, right) => left - right);
}

function parseDmSlugToUserIds(dmSlug: string): number[] {
  return dmSlug
    .split(",")
    .map((part) => part.split("-")[0]?.trim() ?? "")
    .map((rawUserId) => {
      if (!/^\d+$/.test(rawUserId)) return null;
      const parsed = Number(rawUserId);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
      return parsed;
    })
    .filter((userId): userId is number => userId !== null);
}

export function chatToWorkspaceChatId(chat: SidebarChat): string {
  if (chat.type === "stream") {
    return `stream:${chat.stream_id}:general`;
  }
  const userIds =
    Array.isArray(chat.userIds) && chat.userIds.length > 0
      ? chat.userIds
      : parseDmSlugToUserIds(chat.slug);
  return `dm:${userIds.join(",")}`;
}

export function chatToWorkspaceChatIds(chat: SidebarChat, currentUserId: number | null): string[] {
  const ids = [chatToWorkspaceChatId(chat)];
  if (chat.type !== "dm" || chat.isGroup === true || currentUserId == null) {
    return ids;
  }

  const userIds =
    Array.isArray(chat.userIds) && chat.userIds.length > 0
      ? chat.userIds
      : parseDmSlugToUserIds(chat.slug);
  if (userIds.length !== 2 || !userIds.includes(currentUserId)) {
    return ids;
  }

  const peerId = userIds.find((userId) => userId !== currentUserId);
  if (peerId != null) {
    ids.push(`dm:${peerId}`);
  }
  return [...new Set(ids)];
}

export function parseFolderItemStreamId(chatId: string): number | null {
  const trimmed = chatId.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const streamColonMatch = /^stream:(\d+)/.exec(trimmed);
  if (streamColonMatch?.[1]) {
    const parsed = Number(streamColonMatch[1]);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  const streamDashMatch = /^stream-(\d+)$/.exec(trimmed);
  if (streamDashMatch?.[1]) {
    const parsed = Number(streamDashMatch[1]);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  if (/^(dm|pm):/i.test(trimmed)) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

export function parseFolderItemDmUserIds(chatId: string): number[] | null {
  const trimmed = chatId.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const dmMatch = /^(dm|pm):(\d+(?:,\d+)*)$/i.exec(trimmed);
  const rawUserIds = dmMatch?.[2];
  if (!rawUserIds) {
    return null;
  }

  const parsed = rawUserIds
    .split(",")
    .map((rawUserId) => Number(rawUserId))
    .filter((userId) => Number.isSafeInteger(userId) && userId > 0);
  if (parsed.length === 0) {
    return null;
  }

  return [...parsed].sort((left, right) => left - right);
}

export function slugifyFallbackName(value: string): string {
  const normalized = value.trim().toLowerCase();
  const safe = normalized.replace(/[^a-z0-9а-яё-]+/gi, "-").replace(/-+/g, "-");
  return safe.replace(/^-|-$/g, "") || "user";
}

export function resolveFallbackUserName(
  user: FolderSyncUserLike | undefined,
  fallbackName: string,
): string {
  const fullName = user?.full_name?.trim();
  if (fullName != null && fullName.length > 0) {
    return fullName;
  }
  const email = user?.email?.trim();
  if (email != null && email.length > 0) {
    return email;
  }
  return fallbackName;
}

/**
 * Stable map/set key for a folder or pin chat_id.
 * Bare numeric API ids are stream ids (`stream:N:general`); DM ids are sorted `dm:a,b`.
 */
export function canonicalizeChatId(chatId: string): string {
  const trimmed = chatId.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  const numericChatId = parseNumericChatId(trimmed);
  if (numericChatId != null) {
    return `stream:${numericChatId}:general`;
  }

  const streamDashMatch = /^stream-(\d+)$/i.exec(trimmed);
  if (streamDashMatch?.[1]) {
    const parsed = Number(streamDashMatch[1]);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return `stream:${parsed}:general`;
    }
  }

  const streamChat = parseStreamChatId(trimmed);
  if (streamChat != null) {
    return `stream:${streamChat.streamId}:${normalizeStreamTopic(streamChat.topic)}`;
  }

  const dmUserIds = parseFolderItemDmUserIds(trimmed);
  if (dmUserIds != null) {
    return `dm:${dmUserIds.join(",")}`;
  }

  return trimmed;
}

/**
 * Canonical map keys for one folder item (numeric API ids may map to both stream and dm keys).
 */
export function folderItemLookupKeysForChatId(chatId: string): readonly string[] {
  const aliases = new Set<string>();
  addChatIdAliases(aliases, chatId);
  const keys = new Set<string>();
  for (const alias of aliases) {
    keys.add(canonicalizeChatId(alias));
  }
  return [...keys];
}

/** True when two folder/API chat_id values refer to the same chat (numeric, stream, dm aliases). */
export function areEquivalentChatIds(leftChatId: string, rightChatId: string): boolean {
  const leftAliases = new Set<string>();
  addChatIdAliases(leftAliases, leftChatId);
  const rightAliases = new Set<string>();
  addChatIdAliases(rightAliases, rightChatId);
  for (const alias of leftAliases) {
    if (rightAliases.has(alias)) {
      return true;
    }
  }
  return false;
}

/** Resolves a folder item UUID for a chat using canonical lookup keys. */
export function resolveFolderItemUuid(
  items: readonly { chatId: string; uuid: string }[],
  chatId: string,
): string | null {
  const queryKeys = new Set(folderItemLookupKeysForChatId(chatId));
  for (const item of items) {
    for (const key of folderItemLookupKeysForChatId(item.chatId)) {
      if (queryKeys.has(key)) {
        return item.uuid;
      }
    }
  }
  return null;
}

export function addChatIdAliases(target: Set<string>, chatId: string): void {
  const trimmedChatId = chatId.trim();
  if (trimmedChatId.length === 0) {
    return;
  }
  target.add(trimmedChatId);

  const numericChatId = parseNumericChatId(trimmedChatId);
  if (numericChatId != null) {
    target.add(String(numericChatId));
    target.add(`stream:${numericChatId}:general`);
    target.add(`dm:${numericChatId}`);
    return;
  }

  const streamChat = parseStreamChatId(trimmedChatId);
  if (streamChat != null) {
    target.add(`stream:${streamChat.streamId}:general`);
    target.add(`stream:${streamChat.streamId}:${normalizeStreamTopic(streamChat.topic)}`);
    target.add(String(streamChat.streamId));
    return;
  }

  const dmUserIds = parseDmChatUserIds(trimmedChatId);
  if (dmUserIds == null) {
    return;
  }
  target.add(`dm:${dmUserIds.join(",")}`);
  if (dmUserIds.length === 1) {
    const singleDmUserId = dmUserIds[0];
    if (singleDmUserId != null) {
      target.add(String(singleDmUserId));
    }
  }
}

// Зачем: один и тот же чат может иметь несколько представлений chat_id (legacy/numeric/stream/dm).
// Что делает: проверяет совпадение chat_id с учетом всех его alias-вариантов.
export function hasMatchingChatId(chatIdSet: ReadonlySet<string>, chatId: string): boolean {
  const aliases = new Set<string>();
  addChatIdAliases(aliases, chatId);
  for (const alias of aliases) {
    if (chatIdSet.has(alias)) {
      return true;
    }
  }
  return false;
}
