import type { ReactNode } from "react";
import type {
  DmEntryInternal,
  SidebarChat,
  StreamEntryInternal,
  StreamWithLast,
  TopicWithLast,
} from "~/shared/types/sidebar-chat";

export type { TopicWithLast, SidebarChat, StreamWithLast, StreamEntryInternal, DmEntryInternal };

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
  activeDmIdParam?: string | null;
  sidebarDms?: Extract<SidebarChat, { type: "dm" }>[];
  sidebarChats?: SidebarChat[];
  sidebarChatsLoading?: boolean;
  pinReorderMode?: boolean;
  onExitPinReorderMode?: () => void;
  onFolderAssignmentsChanged?: (affectedFolderUuid?: string) => void | Promise<void>;
}

export interface SidebarUiProps extends SidebarProps {
  activityPanelBottomSlot?: ReactNode;
}
