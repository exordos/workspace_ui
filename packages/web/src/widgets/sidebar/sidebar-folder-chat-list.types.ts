import type { SidebarChat } from "./sidebar.types";

/** Folder-mode sidebar chat list + stream topic expansion. */
export interface SidebarFolderChatListProps {
  chats: SidebarChat[];
  selectedFolderId?: string;
  pinFolderId?: string;
  activeStreamSlug?: string | null;
  activeDmIdParam?: string | null;
  activeTopic?: string | null;
  expandedStreamSlugs?: string[];
  onToggleStream?: (slug: string) => void;
  onNewTopic?: (streamSlug: string, topicName: string) => void;
  loading?: boolean;
  showEmptyState?: boolean;
}

export interface NewTopicDialogState {
  streamId: number;
  streamSlug: string;
  streamName: string;
}
