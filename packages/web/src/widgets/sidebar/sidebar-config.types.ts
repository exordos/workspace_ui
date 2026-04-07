export interface SidebarConfig {
  activityOpen: boolean;
  expandedStreamSlug: string | null;
}

export interface SidebarUiState {
  selectedFolderId: string;
  pinReorderMode: boolean;
  searchQuery: string;
  createChatOpen: boolean;
}

export interface SidebarConfigState extends SidebarConfig, SidebarUiState {
  setActivityOpen: (open: boolean) => void;
  setExpandedStreamSlug: (slug: string | null) => void;
  setConfig: (patch: Partial<SidebarConfig>) => void;
  setSelectedFolderId: (folderId: string) => void;
  setPinReorderMode: (enabled: boolean) => void;
  setSearchQuery: (value: string) => void;
  setCreateChatOpen: (open: boolean) => void;
}
