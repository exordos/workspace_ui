/**
 * Sidebar config store — persists sidebar UI preferences.
 *
 * Stores collapsible section states (e.g. activity panel). Persisted to localStorage.
 */
import { create } from "zustand";
import { useInstancesStore } from "~/entities/instance";
import { buildOrgScopedStorageKey } from "~/shared/lib/org-scoped-storage";

const SIDEBAR_CONFIG_STORAGE_KEY = "zulip-web-sidebar-config";

interface SidebarConfig {
  activityOpen: boolean;
  expandedStreamSlug: string | null;
}

const DEFAULT_CONFIG: SidebarConfig = {
  activityOpen: false,
  expandedStreamSlug: null,
};

interface SidebarUiState {
  selectedFolderId: string;
  pinReorderMode: boolean;
}

const DEFAULT_UI_STATE: SidebarUiState = {
  selectedFolderId: "1",
  pinReorderMode: false,
};

function getStorageKeyForOrganization(organizationId: string | null): string {
  return buildOrgScopedStorageKey(SIDEBAR_CONFIG_STORAGE_KEY, organizationId);
}

function loadConfig(
  organizationId: string | null = useInstancesStore.getState().currentInstanceId,
): SidebarConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const scopedKey = getStorageKeyForOrganization(organizationId);
    const legacyFallbackKey =
      scopedKey === SIDEBAR_CONFIG_STORAGE_KEY ? null : SIDEBAR_CONFIG_STORAGE_KEY;
    const raw =
      window.localStorage.getItem(scopedKey) ??
      (legacyFallbackKey ? window.localStorage.getItem(legacyFallbackKey) : null);
    if (!raw) return DEFAULT_CONFIG;
    if (legacyFallbackKey != null && window.localStorage.getItem(scopedKey) == null) {
      window.localStorage.setItem(scopedKey, raw);
    }
    const parsed = JSON.parse(raw) as Partial<SidebarConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
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

interface SidebarConfigState extends SidebarConfig, SidebarUiState {
  setActivityOpen: (open: boolean) => void;
  setExpandedStreamSlug: (slug: string | null) => void;
  setConfig: (patch: Partial<SidebarConfig>) => void;
  setSelectedFolderId: (folderId: string) => void;
  setPinReorderMode: (enabled: boolean) => void;
}

export const useSidebarConfigStore = create<SidebarConfigState>((set) => ({
  ...DEFAULT_UI_STATE,
  ...loadConfig(),

  setActivityOpen: (activityOpen) =>
    set((state) => {
      const next = { ...state, activityOpen };
      saveConfig(next);
      return next;
    }),

  setExpandedStreamSlug: (expandedStreamSlug) =>
    set((state) => {
      const next = { ...state, expandedStreamSlug };
      saveConfig(next);
      return next;
    }),

  setConfig: (patch) =>
    set((state) => {
      const next = { ...state, ...patch };
      saveConfig(next);
      return next;
    }),

  setSelectedFolderId: (selectedFolderId) =>
    set((state) => ({
      ...state,
      selectedFolderId,
      pinReorderMode: false,
    })),

  setPinReorderMode: (pinReorderMode) => set((state) => ({ ...state, pinReorderMode })),
}));

if (typeof window !== "undefined") {
  let previousOrganizationId = useInstancesStore.getState().currentInstanceId;
  useInstancesStore.subscribe((state) => {
    const nextOrganizationId = state.currentInstanceId;
    if (nextOrganizationId === previousOrganizationId) {
      return;
    }

    previousOrganizationId = nextOrganizationId;
    useSidebarConfigStore.setState((prev) => ({
      ...DEFAULT_UI_STATE,
      ...loadConfig(nextOrganizationId),
      // Preserve non-persisted UI state only if it belongs to the same organization.
      selectedFolderId: prev.selectedFolderId,
      pinReorderMode: false,
    }));
  });
}
