import type { SidebarChat } from "./sidebar.types";

export type SidebarDmTab = "recent" | "all";

export interface SidebarDmListProps {
  activeDmIdParam: string | null;
  dms?: Extract<SidebarChat, { type: "dm" }>[];
}
