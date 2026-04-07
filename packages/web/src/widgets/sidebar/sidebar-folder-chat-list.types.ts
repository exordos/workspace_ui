import type { SidebarChat } from "./sidebar.types";

export interface SidebarFolderChatListProps {
  chats: SidebarChat[];
  selectedFolderId?: string;
  pinFolderId?: string;
  activeStreamSlug?: string | null;
  activeDmIdParam?: string | null;
  activeTopic?: string | null;
  expandedStreamSlug?: string | null;
  onToggleStream?: (slug: string) => void;
  onNewTopic?: (streamSlug: string, topicName: string) => void;
  reorderPinnedOnly?: boolean;
  loading?: boolean;
  showEmptyState?: boolean;
  onFolderAssignmentsChanged?: (affectedFolderUuid?: string) => void;
}

export interface NewTopicDialogState {
  streamId: number;
  streamSlug: string;
  streamName: string;
}
