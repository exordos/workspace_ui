import type { SidebarChat } from "./sidebar.types";

export interface SidebarGroupListProps {
  activeDmIdParam: string | null;
  expandedGroupIds: Set<number>;
  onToggleGroup: (id: number) => void;
  /** Group DMs from recent messages. If not provided, mock data is shown. */
  groupChats?: Extract<SidebarChat, { type: "dm" }>[];
}

export interface GroupChat {
  type: "dm";
  id: number;
  name: string;
  slug: string;
  isGroup: true;
  lastMessage?: string;
  time?: string;
  badge?: number;
  pinned?: boolean;
  userIds?: number[];
}
