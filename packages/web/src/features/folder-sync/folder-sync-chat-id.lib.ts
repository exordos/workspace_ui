import type { SidebarChat } from "~/shared/types/sidebar-chat";

export interface FolderSyncUserLike {
  full_name?: string;
  email?: string;
}

export function parseNumericChatId(chatId: string): number | null {
  const trimmed = chatId.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
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
  const dmMatch = /^dm:([0-9]+(?:,[0-9]+)*)$/.exec(chatId.trim());
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
      if (!/^[0-9]+$/.test(rawUserId)) return null;
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

export function parseFolderItemStreamId(chatId: string): number | null {
  const trimmed = chatId.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const streamColonMatch = /^stream:([0-9]+)/.exec(trimmed);
  if (streamColonMatch?.[1]) {
    const parsed = Number(streamColonMatch[1]);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  const streamDashMatch = /^stream-([0-9]+)$/.exec(trimmed);
  if (streamDashMatch?.[1]) {
    const parsed = Number(streamDashMatch[1]);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  if (/^(dm|pm):/i.test(trimmed)) {
    return null;
  }

  if (/^[0-9]+$/.test(trimmed)) {
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

  const dmMatch = /^(dm|pm):([0-9]+(?:,[0-9]+)*)$/i.exec(trimmed);
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
