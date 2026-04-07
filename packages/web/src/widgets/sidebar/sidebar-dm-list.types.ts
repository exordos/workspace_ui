import type { SidebarChat } from "./sidebar.types";

export type SidebarDmTab = "recent" | "all";

export interface SidebarDmListProps {
  activeDmId: number | null;
  dms?: Extract<SidebarChat, { type: "dm" }>[];
}
