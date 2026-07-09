/**
 * Theme store — manages palette and light/dark mode selection.
 *
 * Persists choices to localStorage; applies CSS variables via the theme engine.
 * Listens to OS prefers-color-scheme changes when mode is "system".
 */
import { create } from "zustand";
import {
  buildLegacyWorkspaceSessionStorageKey,
  buildWorkspaceSessionStorageKey,
  getCurrentWorkspaceSessionStorageScope,
  getWorkspaceSessionStorageScopeFromAuthState,
  type WorkspaceSessionStorageScope,
} from "~/entities/workspace-auth/workspace-session-storage-scope.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
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

function getStorageKeysForScope(scope: WorkspaceSessionStorageScope): {
  paletteKey: string;
  modeKey: string;
  legacyPaletteKey: string | null;
  legacyModeKey: string | null;
} {
  return {
    paletteKey: buildWorkspaceSessionStorageKey(STORAGE_KEY_PALETTE, scope),
    modeKey: buildWorkspaceSessionStorageKey(STORAGE_KEY_MODE, scope),
    legacyPaletteKey: buildLegacyWorkspaceSessionStorageKey(STORAGE_KEY_PALETTE, scope),
    legacyModeKey: buildLegacyWorkspaceSessionStorageKey(STORAGE_KEY_MODE, scope),
  };
}

function readStorageWithFallback(primaryKey: string, fallbackKey: string | null): string | null {
  const primary = localStorage.getItem(primaryKey);
  if (primary != null || fallbackKey == null || fallbackKey === primaryKey) return primary;
  return localStorage.getItem(fallbackKey);
}

function loadStored(
  scope: WorkspaceSessionStorageScope = getCurrentWorkspaceSessionStorageScope(),
): { paletteId: string; mode: ThemeMode } {
  if (typeof window === "undefined") return { paletteId: defaultPaletteId, mode: DEFAULT_MODE };
  try {
    const { paletteKey, modeKey, legacyPaletteKey, legacyModeKey } = getStorageKeysForScope(scope);
    const storedMode = readStorageWithFallback(modeKey, legacyModeKey);
    const storedPaletteId = readStorageWithFallback(paletteKey, legacyPaletteKey);

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
  scope: WorkspaceSessionStorageScope = getCurrentWorkspaceSessionStorageScope(),
): void {
  if (typeof window === "undefined") return;
  try {
    const { paletteKey, modeKey } = getStorageKeysForScope(scope);
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

  let previousOwnerKey = getCurrentWorkspaceSessionStorageScope().ownerKey;
  useWorkspaceAuthStore.subscribe((state) => {
    const nextScope = getWorkspaceSessionStorageScopeFromAuthState(state);
    if (nextScope.ownerKey === previousOwnerKey) {
      return;
    }

    previousOwnerKey = nextScope.ownerKey;
    const nextTheme = loadStored(nextScope);
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
