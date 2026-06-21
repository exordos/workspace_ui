import type {
  SidebarChat,
  StreamEntryInternal,
  StreamWithLast,
  TopicWithLast,
} from "~/shared/types/sidebar-chat";
import type { ReactNode } from "react";

export type { TopicWithLast, SidebarChat, StreamWithLast, StreamEntryInternal };

/**
 * Sidebar props.
 *
 * Migration note: these props are kept optional for incremental decoupling from Layout.
 * The end state is a self-contained Sidebar with no required props.
 */
export interface SidebarProps {
  streams?: StreamWithLast[];
  selectedFolderId?: string;
  pinFolderId?: string;
  activeStreamSlug?: string | null;
  activeTopic?: string | null;
  sidebarChats?: Extract<SidebarChat, { type: "stream" }>[];
  sidebarChatsLoading?: boolean;
}

export interface SidebarUiProps extends SidebarProps {
  activityPanelBottomSlot?: ReactNode;
}
