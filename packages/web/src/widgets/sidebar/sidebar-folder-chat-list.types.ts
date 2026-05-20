import type { SidebarChat } from "./sidebar.types";

// Контракт folder-режима списка sidebar: чаты папки + управление раскрытием stream-топиков.
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
  // Данные stream, для которого открыт диалог создания нового топика.
  streamId: number;
  streamSlug: string;
  streamName: string;
}
