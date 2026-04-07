/**
 * Theme store — manages palette and light/dark mode selection.
 *
 * Persists choices to localStorage; applies CSS variables via the theme engine.
 * Listens to OS prefers-color-scheme changes when mode is "system".
 */
import { create } from "zustand";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { buildOrgScopedStorageKey } from "~/shared/lib/org-scoped-storage";
import { applyTheme, getResolvedMode } from "~/shared/lib/themes/engine";
import { defaultPaletteId } from "~/shared/lib/themes/registry";
import type { ThemeMode } from "~/shared/lib/themes/tokens";

interface ThemeState {
  paletteId: string;
  mode: ThemeMode;

  setPalette: (paletteId: string) => void;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const STORAGE_KEY_PALETTE = "workspace-palette";
const STORAGE_KEY_MODE = "workspace-theme-mode";
const DEFAULT_MODE: ThemeMode = "system";

function getStorageKeysForOrganization(organizationId: string | null): {
  paletteKey: string;
  modeKey: string;
} {
  return {
    paletteKey: buildOrgScopedStorageKey(STORAGE_KEY_PALETTE, organizationId),
    modeKey: buildOrgScopedStorageKey(STORAGE_KEY_MODE, organizationId),
  };
}

function loadStored(
  organizationId: string | null = useInstancesStore.getState().currentInstanceId,
): { paletteId: string; mode: ThemeMode } {
  if (typeof window === "undefined") return { paletteId: defaultPaletteId, mode: DEFAULT_MODE };
  try {
    const { paletteKey, modeKey } = getStorageKeysForOrganization(organizationId);
    const shouldUseLegacyFallback =
      paletteKey !== STORAGE_KEY_PALETTE || modeKey !== STORAGE_KEY_MODE;
    const legacyMode = shouldUseLegacyFallback ? localStorage.getItem(STORAGE_KEY_MODE) : null;
    const legacyPalette = shouldUseLegacyFallback
      ? localStorage.getItem(STORAGE_KEY_PALETTE)
      : null;
    const storedMode = localStorage.getItem(modeKey) ?? legacyMode;
    const storedPaletteId = localStorage.getItem(paletteKey) ?? legacyPalette;

    if (
      shouldUseLegacyFallback &&
      localStorage.getItem(paletteKey) == null &&
      localStorage.getItem(modeKey) == null &&
      (legacyPalette != null || legacyMode != null)
    ) {
      if (legacyPalette != null) {
        localStorage.setItem(paletteKey, legacyPalette);
      }
      if (legacyMode != null) {
        localStorage.setItem(modeKey, legacyMode);
      }
    }

    const mode: ThemeMode =
      storedMode === "light" || storedMode === "dark" || storedMode === "system"
        ? storedMode
        : DEFAULT_MODE;
    return {
      paletteId: storedPaletteId ?? defaultPaletteId,
      mode,
    };
  } catch {
    return { paletteId: defaultPaletteId, mode: DEFAULT_MODE };
  }
}

function persist(
  paletteId: string,
  mode: ThemeMode,
  organizationId: string | null = useInstancesStore.getState().currentInstanceId,
): void {
  if (typeof window === "undefined") return;
  try {
    const { paletteKey, modeKey } = getStorageKeysForOrganization(organizationId);
    localStorage.setItem(paletteKey, paletteId);
    localStorage.setItem(modeKey, mode);
  } catch {
    /* quota exceeded or restricted storage */
  }
}

const initial = loadStored();

export const useThemeStore = create<ThemeState>((set, get) => ({
  paletteId: initial.paletteId,
  mode: initial.mode,

  setPalette(paletteId) {
    const { mode } = get();
    persist(paletteId, mode);
    applyTheme(paletteId, mode);
    set({ paletteId });
  },

  setMode(mode) {
    const { paletteId } = get();
    persist(paletteId, mode);
    applyTheme(paletteId, mode);
    set({ mode });
  },

  toggleMode() {
    const { paletteId, mode } = get();
    const resolved = getResolvedMode(mode);
    const next = resolved === "dark" ? "light" : "dark";
    persist(paletteId, next);
    applyTheme(paletteId, next);
    set({ mode: next });
  },
}));

if (typeof window !== "undefined") {
  applyTheme(initial.paletteId, initial.mode);

  let previousOrganizationId = useInstancesStore.getState().currentInstanceId;
  useInstancesStore.subscribe((state) => {
    const nextOrganizationId = state.currentInstanceId;
    if (nextOrganizationId === previousOrganizationId) {
      return;
    }

    previousOrganizationId = nextOrganizationId;
    const nextTheme = loadStored(nextOrganizationId);
    useThemeStore.setState(nextTheme);
    applyTheme(nextTheme.paletteId, nextTheme.mode);
  });

  const colorSchemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleColorSchemeChange = () => {
    const { paletteId, mode } = useThemeStore.getState();
    if (mode === "system") {
      applyTheme(paletteId, mode);
    }
  };

  colorSchemeMediaQuery.addEventListener("change", handleColorSchemeChange);
}
