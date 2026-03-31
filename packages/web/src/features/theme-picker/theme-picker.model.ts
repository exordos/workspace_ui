/**
 * Theme picker store — thin wrapper around the entity theme store.
 *
 * Exposes available palettes with preview colors for the UI picker,
 * and delegates actual palette/mode changes to the theme entity.
 */

import { useThemeStore } from "~/entities/theme/theme.model";
import { logStoreAction } from "~/shared/lib/logger";
import { palettes } from "~/shared/lib/themes/registry";
import type { ThemeMode } from "~/shared/lib/themes/tokens";
import type { AvailablePalette } from "./theme-picker.types";

let cachedPalettes: AvailablePalette[] | null = null;

export function getAvailablePalettes(): AvailablePalette[] {
  if (cachedPalettes) return cachedPalettes;

  cachedPalettes = palettes.map((p) => ({
    id: p.id,
    name: p.name,
    preview: {
      bg: p.dark.bg,
      accent: p.dark.accent,
      sidebar: p.dark["sidebar-bg"],
    },
  }));

  return cachedPalettes;
}

export function selectPalette(paletteId: string): void {
  logStoreAction("theme-picker", "selectPalette", { paletteId });
  useThemeStore.getState().setPalette(paletteId);
}

export function selectMode(mode: ThemeMode): void {
  logStoreAction("theme-picker", "selectMode", { mode });
  useThemeStore.getState().setMode(mode);
}

export function toggleMode(): void {
  logStoreAction("theme-picker", "toggleMode", {});
  useThemeStore.getState().toggleMode();
}
