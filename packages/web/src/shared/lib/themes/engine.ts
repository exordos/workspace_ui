import { getPalette } from "./registry";
import type { PaletteTokens, ThemeMode } from "./tokens";

export const CSS_VAR_PREFIX = "--color-";

export function getResolvedMode(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(paletteId: string, mode: ThemeMode): void {
  if (typeof document === "undefined") return;

  const palette = getPalette(paletteId);
  const resolved = getResolvedMode(mode);
  const tokens = resolved === "dark" ? palette.dark : palette.light;

  const root = document.documentElement;

  for (const [key, value] of Object.entries(tokens) as [keyof PaletteTokens, string][]) {
    root.style.setProperty(`${CSS_VAR_PREFIX}${key}`, value);
  }

  root.dataset.theme = resolved;
  root.dataset.palette = paletteId;

  const metaThemeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.content = tokens.bg;
  }
}
