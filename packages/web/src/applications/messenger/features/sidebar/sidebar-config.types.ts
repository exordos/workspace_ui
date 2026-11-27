/** Sidebar config persisted in localStorage. */
export interface SidebarConfig {
  activityOpen: boolean;
  expandedStreamUuids: string[];
}

/** Transient sidebar UI state (not business data). */
export interface SidebarUiState {
  selectedFolderId: string;
  searchQuery: string;
  createChatOpen: boolean;
}

export interface SidebarConfigState extends SidebarConfig, SidebarUiState {
  setActivityOpen: (open: boolean) => void;
  toggleExpandedStreamUuid: (uuid: string) => void;
  expandStreamUuid: (uuid: string) => void;
  collapseExpandedStreamsExcept: (uuid: string) => void;
  collapseAllExpandedStreams: () => void;
  setConfig: (patch: Partial<SidebarConfig>) => void;
  setSelectedFolderId: (folderId: string) => void;
  setSearchQuery: (value: string) => void;
  setCreateChatOpen: (open: boolean) => void;
}
