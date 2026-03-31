import type { SidebarChat } from "./sidebar.types";
import { parseDmSlugToUserIds } from "./sidebar.lib";

export function normalizeSidebarSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function doesSidebarChatMatchQuery(options: {
  chat: SidebarChat;
  normalizedQuery: string;
  users: Map<number, { full_name: string; email?: string | null | undefined }>;
}): boolean {
  const { chat, normalizedQuery, users } = options;
  if (!normalizedQuery) return true;

  if (chat.type === "stream") {
    const nameMatch = chat.name.toLowerCase().includes(normalizedQuery);
    const topicMatch = chat.topics?.some((topic) =>
      topic.subject.toLowerCase().includes(normalizedQuery),
    );
    return nameMatch || (topicMatch ?? false);
  }

  const nameMatch = chat.name.toLowerCase().includes(normalizedQuery);
  if (nameMatch) return true;

  const participantIds =
    Array.isArray(chat.userIds) && chat.userIds.length > 0 ? chat.userIds : parseDmSlugToUserIds(chat.slug);

  return participantIds.some((userId) => {
    const user = users.get(userId);
    if (!user) return false;
    if (user.full_name.toLowerCase().includes(normalizedQuery)) return true;
    return user.email?.toLowerCase().includes(normalizedQuery) ?? false;
  });
}

