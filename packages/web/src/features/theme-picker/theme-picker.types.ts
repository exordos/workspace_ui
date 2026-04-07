/**
 * Theme palette picker type definitions.
 *
 * Provides a UI-oriented view of available palettes with preview colors
 * extracted from the theme engine's registered palettes.
 */

export interface PalettePreview {
  bg: string;
  accent: string;
  sidebar: string;
}

export interface AvailablePalette {
  id: string;
  name: string;
  preview: PalettePreview;
}
