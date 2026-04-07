import type { SidebarChat } from "./sidebar.types";

export interface SidebarStreamListProps {
  streamChats: SidebarChat[];
  activeStreamSlug: string | null;
  activeTopic?: string | null;
  expandedStreamSlug: string | null;
  onToggleStream: (slug: string) => void;
  onNewTopic?: (streamSlug: string, topicName: string) => void;
}
