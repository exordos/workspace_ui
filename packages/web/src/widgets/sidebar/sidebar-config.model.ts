import { create } from "zustand";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { buildOrgScopedStorageKey } from "~/shared/lib/org-scoped-storage";
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

function getStorageKeyForOrganization(organizationId: string | null): string {
  return buildOrgScopedStorageKey(SIDEBAR_CONFIG_STORAGE_KEY, organizationId);
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

function loadConfig(
  organizationId: string | null = useInstancesStore.getState().currentInstanceId,
): SidebarConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const scopedKey = getStorageKeyForOrganization(organizationId);
    const raw = window.localStorage.getItem(scopedKey);
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
  organizationId: string | null = useInstancesStore.getState().currentInstanceId,
): void {
  if (typeof window === "undefined") return;
  try {
    const scopedKey = getStorageKeyForOrganization(organizationId);
    window.localStorage.setItem(scopedKey, JSON.stringify(config));
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
  let previousOrganizationId = useInstancesStore.getState().currentInstanceId;
  useInstancesStore.subscribe((state) => {
    const nextOrganizationId = state.currentInstanceId;
    if (nextOrganizationId === previousOrganizationId) {
      return;
    }

    previousOrganizationId = nextOrganizationId;
    // On org switch: reload scoped persist and reset transient UI flags.
    useSidebarConfigStore.setState((prev) => ({
      ...DEFAULT_UI_STATE,
      ...loadConfig(nextOrganizationId),
      // Preserve non-persisted UI state only if it belongs to the same organization.
      selectedFolderId: prev.selectedFolderId,
    }));
  });
}
