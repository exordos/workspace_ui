import { create } from "zustand";
import {
  buildLegacyWorkspaceSessionStorageKey,
  buildWorkspaceSessionStorageKey,
  getCurrentWorkspaceSessionStorageScope,
  getWorkspaceSessionStorageScopeFromAuthState,
  type WorkspaceSessionStorageScope,
} from "~/entities/workspace-auth/workspace-session-storage-scope.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { SIDEBAR_SYSTEM_ALL_FOLDER_ID } from "./sidebar-folder.constants";
import type { SidebarConfig, SidebarConfigState, SidebarUiState } from "./sidebar-config.types";

const SIDEBAR_CONFIG_STORAGE_KEY = "workspace-sidebar-config";

const DEFAULT_CONFIG: SidebarConfig = {
  activityOpen: false,
  expandedStreamUuids: [],
};

const DEFAULT_UI_STATE: SidebarUiState = {
  selectedFolderId: SIDEBAR_SYSTEM_ALL_FOLDER_ID,
  searchQuery: "",
  createChatOpen: false,
};

function getStorageKeysForScope(scope: WorkspaceSessionStorageScope): {
  key: string;
  legacyKey: string | null;
} {
  return {
    key: buildWorkspaceSessionStorageKey(SIDEBAR_CONFIG_STORAGE_KEY, scope),
    legacyKey: buildLegacyWorkspaceSessionStorageKey(SIDEBAR_CONFIG_STORAGE_KEY, scope),
  };
}

function normalizeExpandedStreamUuids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const uuid = item.trim();
    if (uuid.length === 0) continue;
    unique.add(uuid);
  }
  return [...unique];
}

function buildPersistedConfig(state: Pick<SidebarConfigState, keyof SidebarConfig>): SidebarConfig {
  return {
    activityOpen: state.activityOpen,
    expandedStreamUuids: normalizeExpandedStreamUuids(state.expandedStreamUuids),
  };
}

function readConfigRaw(key: string, legacyKey: string | null): string | null {
  const raw = window.localStorage.getItem(key);
  if (raw != null || legacyKey == null || legacyKey === key) return raw;
  return window.localStorage.getItem(legacyKey);
}

function loadConfig(
  scope: WorkspaceSessionStorageScope = getCurrentWorkspaceSessionStorageScope(),
): SidebarConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const { key, legacyKey } = getStorageKeysForScope(scope);
    const raw = readConfigRaw(key, legacyKey);
    if (!raw) return DEFAULT_CONFIG;
    // Ignore legacy single-stream format; read expandedStreamUuids and activityOpen only.
    const parsed = JSON.parse(raw) as Partial<SidebarConfig>;
    return {
      activityOpen: parsed.activityOpen === true,
      expandedStreamUuids: normalizeExpandedStreamUuids(parsed.expandedStreamUuids),
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(
  config: SidebarConfig,
  scope: WorkspaceSessionStorageScope = getCurrentWorkspaceSessionStorageScope(),
): void {
  if (typeof window === "undefined") return;
  try {
    const { key } = getStorageKeysForScope(scope);
    window.localStorage.setItem(key, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export const useSidebarConfigStore = create<SidebarConfigState>((set) => ({
  ...DEFAULT_UI_STATE,
  ...loadConfig(),

  setActivityOpen: (activityOpen) =>
    set((state) => {
      const next = { ...state, activityOpen };
      saveConfig(buildPersistedConfig(next));
      return next;
    }),

  toggleExpandedStreamUuid: (uuid) =>
    set((state) => {
      const streamUuid = uuid.trim();
      if (streamUuid.length === 0) return state;
      const expandedStreamUuids = state.expandedStreamUuids.includes(streamUuid)
        ? state.expandedStreamUuids.filter((value) => value !== streamUuid)
        : [...state.expandedStreamUuids, streamUuid];
      const next = { ...state, expandedStreamUuids };
      saveConfig(buildPersistedConfig(next));
      return next;
    }),

  expandStreamUuid: (uuid) =>
    set((state) => {
      const streamUuid = uuid.trim();
      if (streamUuid.length === 0 || state.expandedStreamUuids.includes(streamUuid)) {
        return state;
      }
      const next = { ...state, expandedStreamUuids: [...state.expandedStreamUuids, streamUuid] };
      saveConfig(buildPersistedConfig(next));
      return next;
    }),

  collapseExpandedStreamsExcept: (uuid) =>
    set((state) => {
      // Navigation: keep only the target stream expanded.
      const streamUuid = uuid.trim();
      if (streamUuid.length === 0) {
        if (state.expandedStreamUuids.length === 0) return state;
        const next = { ...state, expandedStreamUuids: [] };
        saveConfig(buildPersistedConfig(next));
        return next;
      }
      if (state.expandedStreamUuids.length === 1 && state.expandedStreamUuids[0] === streamUuid) {
        return state;
      }
      const next = { ...state, expandedStreamUuids: [streamUuid] };
      saveConfig(buildPersistedConfig(next));
      return next;
    }),

  collapseAllExpandedStreams: () =>
    set((state) => {
      if (state.expandedStreamUuids.length === 0) return state;
      const next = { ...state, expandedStreamUuids: [] };
      saveConfig(buildPersistedConfig(next));
      return next;
    }),

  setConfig: (patch) =>
    set((state) => {
      const next = {
        ...state,
        ...patch,
        expandedStreamUuids:
          patch.expandedStreamUuids == null
            ? state.expandedStreamUuids
            : normalizeExpandedStreamUuids(patch.expandedStreamUuids),
      };
      saveConfig(buildPersistedConfig(next));
      return next;
    }),

  setSelectedFolderId: (selectedFolderId) => set((state) => ({ ...state, selectedFolderId })),

  setSearchQuery: (searchQuery) => set((state) => ({ ...state, searchQuery })),

  setCreateChatOpen: (createChatOpen) => set((state) => ({ ...state, createChatOpen })),
}));

if (typeof window !== "undefined") {
  let previousOwnerKey = getCurrentWorkspaceSessionStorageScope().ownerKey;
  useWorkspaceAuthStore.subscribe((state) => {
    const nextScope = getWorkspaceSessionStorageScopeFromAuthState(state);
    if (nextScope.ownerKey === previousOwnerKey) {
      return;
    }

    previousOwnerKey = nextScope.ownerKey;
    // On owner switch: reload scoped persist and reset transient UI flags.
    useSidebarConfigStore.setState((prev) => ({
      ...DEFAULT_UI_STATE,
      ...loadConfig(nextScope),
      // Preserve the current selection while persisted sidebar flags are reloaded.
      selectedFolderId: prev.selectedFolderId,
    }));
  });
}
