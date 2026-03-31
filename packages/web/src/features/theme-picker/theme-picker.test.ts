/**
 * Tests for the theme palette picker feature.
 *
 * Verifies that available palettes are correctly mapped from the registry,
 * and that selection delegates to the underlying theme store.
 */
import { afterEach, describe, expect, it } from "vitest";
import { useThemeStore } from "~/entities/theme/theme.model";
import { getAvailablePalettes, selectPalette, selectMode, toggleMode } from "./theme-picker.model";

describe("Theme Picker", () => {
  afterEach(() => {
    useThemeStore.getState().setPalette("orange-warm");
    useThemeStore.getState().setMode("dark");
  });

  describe("getAvailablePalettes", () => {
    it("returns at least 2 palettes", () => {
      const palettes = getAvailablePalettes();
      expect(palettes.length).toBeGreaterThanOrEqual(2);
    });

    it("each palette has id, name, and preview colors", () => {
      const palettes = getAvailablePalettes();
      for (const p of palettes) {
        expect(p.id).toBeTruthy();
        expect(p.name).toBeTruthy();
        expect(p.preview.bg).toBeTruthy();
        expect(p.preview.accent).toBeTruthy();
        expect(p.preview.sidebar).toBeTruthy();
      }
    });

    it("includes orange-warm palette", () => {
      const palettes = getAvailablePalettes();
      expect(palettes.some((p) => p.id === "orange-warm")).toBe(true);
    });

    it("includes blue-cold palette", () => {
      const palettes = getAvailablePalettes();
      expect(palettes.some((p) => p.id === "blue-cold")).toBe(true);
    });

    it("includes blue-mist palette", () => {
      const palettes = getAvailablePalettes();
      expect(palettes.some((p) => p.id === "blue-mist")).toBe(true);
    });

    it("includes emerald-chat palette", () => {
      const palettes = getAvailablePalettes();
      expect(palettes.some((p) => p.id === "emerald-chat")).toBe(true);
    });
  });

  describe("selectPalette", () => {
    it("updates the theme store palette", () => {
      selectPalette("blue-cold");
      expect(useThemeStore.getState().paletteId).toBe("blue-cold");
    });
  });

  describe("selectMode", () => {
    it("updates the theme store mode", () => {
      selectMode("light");
      expect(useThemeStore.getState().mode).toBe("light");
    });
  });

  describe("toggleMode", () => {
    it("toggles from dark to light", () => {
      useThemeStore.getState().setMode("dark");
      toggleMode();
      expect(useThemeStore.getState().mode).toBe("light");
    });
  });
});
