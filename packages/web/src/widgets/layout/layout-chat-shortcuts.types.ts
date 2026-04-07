import type { SidebarChat } from "~/shared/types/sidebar-chat";

export type ChatShortcutDirection = "next" | "prev";

export interface ResolveChatShortcutRouteOptions {
  sidebarChats: SidebarChat[];
  direction: ChatShortcutDirection;
  activeStreamSlug?: string | null;
  activeDmIdParam?: string | null;
}
