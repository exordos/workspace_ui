import type { SidebarChat } from "./sidebar.types";

// Контракт legacy stream-list режима sidebar (когда нет folder sidebarChats).
export interface SidebarStreamListProps {
  streamChats: SidebarChat[];
  activeStreamSlug: string | null;
  activeTopic?: string | null;
  expandedStreamSlugs: string[];
  onToggleStream: (slug: string) => void;
  onNewTopic?: (streamSlug: string, topicName: string) => void;
}
