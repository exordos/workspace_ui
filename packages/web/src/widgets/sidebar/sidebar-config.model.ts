import { create } from "zustand";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { SYSTEM_ALL_FOLDER_ID } from "~/features/folder-sync/folder-sync-constants.lib";
import { buildOrgScopedStorageKey } from "~/shared/lib/org-scoped-storage";
import type { SidebarConfig, SidebarConfigState, SidebarUiState } from "./sidebar-config.types";

const SIDEBAR_CONFIG_STORAGE_KEY = "zulip-web-sidebar-config";

const DEFAULT_CONFIG: SidebarConfig = {
  activityOpen: false,
  expandedStreamSlugs: [],
};

const DEFAULT_UI_STATE: SidebarUiState = {
  selectedFolderId: SYSTEM_ALL_FOLDER_ID,
  searchQuery: "",
  createChatOpen: false,
};

function getStorageKeyForOrganization(organizationId: string | null): string {
  return buildOrgScopedStorageKey(SIDEBAR_CONFIG_STORAGE_KEY, organizationId);
}

function normalizeExpandedStreamSlugs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const slug = item.trim();
    if (slug.length === 0) continue;
    unique.add(slug);
  }
  return [...unique];
}

function buildPersistedConfig(state: Pick<SidebarConfigState, keyof SidebarConfig>): SidebarConfig {
  return {
    activityOpen: state.activityOpen,
    expandedStreamSlugs: normalizeExpandedStreamSlugs(state.expandedStreamSlugs),
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
    // Ignore legacy single-slug format; read expandedStreamSlugs and activityOpen only.
    const parsed = JSON.parse(raw) as Partial<SidebarConfig>;
    return {
      activityOpen: parsed.activityOpen === true,
      expandedStreamSlugs: normalizeExpandedStreamSlugs(parsed.expandedStreamSlugs),
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

  toggleExpandedStreamSlug: (slug) =>
    set((state) => {
      const streamSlug = slug.trim();
      if (streamSlug.length === 0) return state;
      const expandedStreamSlugs = state.expandedStreamSlugs.includes(streamSlug)
        ? state.expandedStreamSlugs.filter((value) => value !== streamSlug)
        : [...state.expandedStreamSlugs, streamSlug];
      const next = { ...state, expandedStreamSlugs };
      saveConfig(buildPersistedConfig(next));
      return next;
    }),

  expandStreamSlug: (slug) =>
    set((state) => {
      const streamSlug = slug.trim();
      if (streamSlug.length === 0 || state.expandedStreamSlugs.includes(streamSlug)) {
        return state;
      }
      const next = { ...state, expandedStreamSlugs: [...state.expandedStreamSlugs, streamSlug] };
      saveConfig(buildPersistedConfig(next));
      return next;
    }),

  collapseExpandedStreamsExcept: (slug) =>
    set((state) => {
      // Navigation: keep only the target stream expanded.
      const streamSlug = slug.trim();
      if (streamSlug.length === 0) {
        if (state.expandedStreamSlugs.length === 0) return state;
        const next = { ...state, expandedStreamSlugs: [] };
        saveConfig(buildPersistedConfig(next));
        return next;
      }
      if (state.expandedStreamSlugs.length === 1 && state.expandedStreamSlugs[0] === streamSlug) {
        return state;
      }
      const next = { ...state, expandedStreamSlugs: [streamSlug] };
      saveConfig(buildPersistedConfig(next));
      return next;
    }),

  collapseAllExpandedStreams: () =>
    set((state) => {
      if (state.expandedStreamSlugs.length === 0) return state;
      const next = { ...state, expandedStreamSlugs: [] };
      saveConfig(buildPersistedConfig(next));
      return next;
    }),

  setConfig: (patch) =>
    set((state) => {
      const next = {
        ...state,
        ...patch,
        expandedStreamSlugs:
          patch.expandedStreamSlugs == null
            ? state.expandedStreamSlugs
            : normalizeExpandedStreamSlugs(patch.expandedStreamSlugs),
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
