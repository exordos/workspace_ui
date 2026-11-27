import type { SidebarSearchHandle } from "./sidebar.types";
import type { Ref } from "react";

export interface SidebarSearchHeaderProps {
  searchRef?: Ref<SidebarSearchHandle>;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onOpenCreateChat?: () => void;
}
