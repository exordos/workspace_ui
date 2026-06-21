import type { SidebarChat } from "./sidebar.types";

type SidebarStreamChat = Extract<SidebarChat, { type: "stream" }>;

/** Folder-mode sidebar stream list + stream topic expansion. */
export interface SidebarFolderChatListProps {
  chats: SidebarStreamChat[];
  selectedFolderId?: string;
  pinFolderId?: string;
  activeStreamSlug?: string | null;
  activeTopic?: string | null;
  expandedStreamSlugs?: string[];
  onToggleStream?: (slug: string) => void;
  onNewTopic?: (streamSlug: string, topicName: string) => void;
  loading?: boolean;
  showEmptyState?: boolean;
}
