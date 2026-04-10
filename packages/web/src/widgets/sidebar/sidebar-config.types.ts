// Persist-конфигурация sidebar, которая хранится в localStorage.
export interface SidebarConfig {
  activityOpen: boolean;
  expandedStreamSlugs: string[];
}

// Временное UI-состояние sidebar (не относится к бизнес-данным).
export interface SidebarUiState {
  selectedFolderId: string;
  pinReorderMode: boolean;
  searchQuery: string;
  createChatOpen: boolean;
}

export interface SidebarConfigState extends SidebarConfig, SidebarUiState {
  setActivityOpen: (open: boolean) => void;
  // Ручной toggle раскрытия канала из кнопки-стрелки.
  toggleExpandedStreamSlug: (slug: string) => void;
  // Идемпотентное раскрытие (используется из внешних UI-точек, например chat-page).
  expandStreamSlug: (slug: string) => void;
  // Навигационный режим: оставить раскрытым только целевой канал.
  collapseExpandedStreamsExcept: (slug: string) => void;
  // Полностью свернуть все раскрытые каналы.
  collapseAllExpandedStreams: () => void;
  setConfig: (patch: Partial<SidebarConfig>) => void;
  setSelectedFolderId: (folderId: string) => void;
  setPinReorderMode: (enabled: boolean) => void;
  setSearchQuery: (value: string) => void;
  setCreateChatOpen: (open: boolean) => void;
}
