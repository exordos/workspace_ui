/**
 * Tests for the theme system: palette registry, token completeness, and mode resolution.
 *
 * Verifies that all registered palettes define the full set of 42 design tokens
 * for both light and dark modes, that palette lookup works with fallbacks, and
 * that the "system" mode correctly resolves to light/dark. These tests protect
 * against missing tokens that would cause CSS variables to be undefined,
 * resulting in invisible or broken UI elements.
 */
import { describe, expect, it } from "vitest";
import { getResolvedMode } from "~/shared/lib/themes/engine";
import { palettes, getPalette, defaultPaletteId } from "~/shared/lib/themes/registry";
import type { PaletteTokens } from "~/shared/lib/themes/tokens";

const ALL_TOKEN_KEYS: (keyof PaletteTokens)[] = [
  "bg",
  "bg-elevated",
  "card-bg",
  "card-bg-active",
  "text-field-bg",
  "text-primary",
  "text-secondary",
  "text-muted",
  "accent",
  "accent-soft",
  "on-accent",
  "border-subtle",
  "sidebar-bg",
  "sidebar-item-hover",
  "sidebar-sender",
  "sidebar-unread",
  "composer-outer",
  "composer-send",
  "composer-icon",
  "msg-bg",
  "msg-own-bg",
  "msg-time",
  "msg-call-bg",
  "msg-selected",
  "icon-base",
  "icon-disable",
  "icon-hover",
  "icon-active",
  "notice-base",
  "notice-disable",
  "badge-bg",
  "badge-text",
  "call-bg",
  "call-green",
  "search-bg",
  "search-hint",
  "indicator-yellow",
  "indicator-pink",
  "indicator-purple",
  "indicator-green",
  "indicator-orange",
];

// Validates the palette registry and token completeness for all palettes
describe("theme palettes", () => {
  // At least Orange Warm and Blue Cold must exist for visual variety
  it("has at least 2 palettes", () => {
    expect(palettes.length).toBeGreaterThanOrEqual(2);
  });

  it("includes emerald-chat palette", () => {
    expect(palettes.some((p) => p.id === "emerald-chat")).toBe(true);
  });

  // Palettes need both a programmatic ID and a human-readable name for settings UI
  it("each palette has id and name", () => {
    for (const p of palettes) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
    }
  });

  // Missing tokens would cause undefined CSS vars — UI elements would be invisible
  it("each palette defines all 42 tokens for light mode", () => {
    for (const p of palettes) {
      for (const key of ALL_TOKEN_KEYS) {
        expect(p.light[key], `${p.id}.light.${key}`).toBeTruthy();
      }
    }
  });

  // Dark mode tokens are independent — each must be explicitly defined
  it("each palette defines all 42 tokens for dark mode", () => {
    for (const p of palettes) {
      for (const key of ALL_TOKEN_KEYS) {
        expect(p.dark[key], `${p.id}.dark.${key}`).toBeTruthy();
      }
    }
  });

  // Duplicate IDs would cause getPalette to return the wrong palette
  it("no duplicate palette IDs", () => {
    const ids = palettes.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// Verifies palette lookup with fallback for unknown IDs
describe("getPalette", () => {
  // Standard lookup by known ID
  it("returns palette by ID", () => {
    const p = getPalette("orange-warm");
    expect(p.id).toBe("orange-warm");
  });

  // Corrupt/missing palette ID from localStorage should not crash the app
  it("falls back to first palette for unknown ID", () => {
    const p = getPalette("nonexistent");
    expect(p.id).toBe(palettes[0]!.id);
  });
});

// Ensures the default palette ID points to an actual registered palette
describe("defaultPaletteId", () => {
  // If the default doesn't match a real palette, the initial theme would break
  it("matches a registered palette", () => {
    expect(palettes.some((p) => p.id === defaultPaletteId)).toBe(true);
  });

  it("uses blue-mist as the product default palette", () => {
    expect(defaultPaletteId).toBe("blue-mist");
  });
});

// Verifies mode resolution: "light"/"dark" pass through, "system" reads OS preference
describe("getResolvedMode", () => {
  // Explicit "light" must always resolve to light
  it("returns light for light", () => {
    expect(getResolvedMode("light")).toBe("light");
  });

  // Explicit "dark" must always resolve to dark
  it("returns dark for dark", () => {
    expect(getResolvedMode("dark")).toBe("dark");
  });

  // "system" reads prefers-color-scheme from the OS — either result is valid
  it("returns light or dark for system", () => {
    const result = getResolvedMode("system");
    expect(["light", "dark"]).toContain(result);
  });
});

describe("blue-cold light palette spec", () => {
  it("matches screenshot-aligned light cold blue values", () => {
    const blueCold = getPalette("blue-cold");
    const light = blueCold.light;

    expect(light.bg).toBe("#e0ecf0");
    expect(light["bg-elevated"]).toBe("#ffffff");
    expect(light.accent).toBe("#7087ff");
    expect(light["on-accent"]).toBe("#1b1b1d");

    expect(light["text-primary"]).toBe("#1b1b1d");
    expect(light["text-secondary"]).toBe("#707b88");
    expect(light["text-muted"]).toBe("#97a3b2");

    expect(light["icon-base"]).toBe("#97a3b2");
    expect(light["icon-disable"]).toBe("#b4bfcb");
    expect(light["icon-hover"]).toBe("#c9e7ff");
    expect(light["icon-active"]).toBe("#1b1b1d");

    expect(light["msg-bg"]).toBe("#ffffff");
    expect(light["msg-time"]).toBe("#97a3b2");
    expect(light["msg-own-bg"]).toBe("#cce4fc");
    expect(light["msg-call-bg"]).toBe("#cfe5d6");
    expect(light["call-bg"]).toBe("#cfe5d6");
    expect(light["msg-selected"]).toBe("#c9e7ff");

    expect(light["card-bg"]).toBe("#ecf4f8");
    expect(light["card-bg-active"]).toBe("#c9e7ff");
    expect(light["sidebar-bg"]).toBe("#ffffff");
    expect(light["sidebar-item-hover"]).toBe("#ecf4fc");

    expect(light["notice-base"]).toBe("#7087ff");
    expect(light["notice-disable"]).toBe("#9ba6b4");
    expect(light["badge-text"]).toBe("#ffffff");
    expect(light["badge-bg"]).toBe("#7087ff");

    expect(light["text-field-bg"]).toBe("#eef5fd");
    expect(light["search-bg"]).toBe("#eef5fd");
    expect(light["border-subtle"]).toBe("#d8e4ef");

    expect(light["indicator-yellow"]).toBe("#ffd633");
    expect(light["indicator-pink"]).toBe("#f458d2");
    expect(light["indicator-purple"]).toBe("#8d6dff");
    expect(light["indicator-orange"]).toBe("#ff8900");
    expect(light["indicator-green"]).toBe("#26c038");
  });
});

describe("orange-warm light palette spec", () => {
  it("matches screenshot-aligned light warm orange values", () => {
    const orangeWarm = getPalette("orange-warm");
    const light = orangeWarm.light;

    expect(light.bg).toBe("#e4e4e4");
    expect(light["bg-elevated"]).toBe("#ffffff");
    expect(light.accent).toBe("#ff8438");
    expect(light["on-accent"]).toBe("#1b1b1d");

    expect(light["text-primary"]).toBe("#1b1b1d");
    expect(light["text-secondary"]).toBe("#7e7e7e");
    expect(light["text-muted"]).toBe("#989898");

    expect(light["card-bg"]).toBe("#f4f4f4");
    expect(light["card-bg-active"]).toBe("#fde8cd");
    expect(light["sidebar-bg"]).toBe("#fafafa");
    expect(light["sidebar-item-hover"]).toBe("#f0f0f0");

    expect(light["msg-bg"]).toBe("#ffffff");
    expect(light["msg-own-bg"]).toBe("#fce8d0");
    expect(light["msg-call-bg"]).toBe("#d8e4c8");
    expect(light["call-bg"]).toBe("#d8e4c8");
    expect(light["msg-time"]).toBe("#989898");
    expect(light["msg-selected"]).toBe("rgba(255, 132, 56, 0.32)");

    expect(light["icon-base"]).toBe("#989898");
    expect(light["icon-disable"]).toBe("#b0b0b0");
    expect(light["icon-hover"]).toBe("#fde8cd");
    expect(light["icon-active"]).toBe("#1b1b1d");

    expect(light["text-field-bg"]).toBe("#e6e6e6");
    expect(light["search-bg"]).toBe("#e6e6e6");
    expect(light["search-hint"]).toBe("#989898");
    expect(light["border-subtle"]).toBe("#d9d9d9");

    expect(light["notice-base"]).toBe("#ff8438");
    expect(light["notice-disable"]).toBe("#9a9a9a");
    expect(light["badge-bg"]).toBe("#ff8438");
    expect(light["badge-text"]).toBe("#ffffff");
  });
});

describe("blue-mist light palette spec", () => {
  it("provides softer blue-cold-adjacent light values", () => {
    const blueMist = getPalette("blue-mist");
    const light = blueMist.light;

    expect(light.bg).toBe("#e8f0f5");
    expect(light["bg-elevated"]).toBe("#ffffff");
    expect(light.accent).toBe("#6f90d8");
    expect(light["on-accent"]).toBe("#101a28");

    expect(light["text-primary"]).toBe("#1a2330");
    expect(light["text-secondary"]).toBe("#66758a");
    expect(light["text-muted"]).toBe("#8d9bae");

    expect(light["card-bg"]).toBe("#eff5fb");
    expect(light["card-bg-active"]).toBe("#d5e5f6");
    expect(light["sidebar-bg"]).toBe("#f9fcff");
    expect(light["sidebar-item-hover"]).toBe("#edf4fb");

    expect(light["msg-bg"]).toBe("#ffffff");
    expect(light["msg-own-bg"]).toBe("#dbe8f8");
    expect(light["msg-call-bg"]).toBe("#cfe6dc");
    expect(light["call-bg"]).toBe("#cfe6dc");
    expect(light["msg-time"]).toBe("#8d9bae");
    expect(light["msg-selected"]).toBe("#d5e5f6");

    expect(light["icon-base"]).toBe("#8d9bae");
    expect(light["icon-disable"]).toBe("#b8c3d1");
    expect(light["icon-hover"]).toBe("#dce8fb");
    expect(light["icon-active"]).toBe("#1a2330");

    expect(light["text-field-bg"]).toBe("#f0f6fc");
    expect(light["search-bg"]).toBe("#f0f6fc");
    expect(light["search-hint"]).toBe("#8d9bae");
    expect(light["border-subtle"]).toBe("#d3dfec");

    expect(light["notice-base"]).toBe("#6f90d8");
    expect(light["notice-disable"]).toBe("#9ca9bb");
    expect(light["badge-bg"]).toBe("#6f90d8");
    expect(light["badge-text"]).toBe("#ffffff");
  });
});

describe("emerald-chat dark palette spec", () => {
  it("uses neutral dark-gray surfaces for panel backgrounds", () => {
    const emeraldChat = getPalette("emerald-chat");
    const dark = emeraldChat.dark;

    expect(dark.bg).toBe("#1b1b1d");
    expect(dark["bg-elevated"]).toBe("#26262a");
    expect(dark["card-bg"]).toBe("#373737");
    expect(dark["card-bg-active"]).toBe("#4b4b4b");
    expect(dark["sidebar-bg"]).toBe("#2c2c2e");
    expect(dark["sidebar-item-hover"]).toBe("#38383a");
    expect(dark["border-subtle"]).toBe("#3f3f45");
  });
});

describe("dark palette structural contract", () => {
  it("keeps dark search and selection overlays aligned across palettes", () => {
    const expectedSelections = {
      "blue-cold": "rgba(112, 135, 255, 0.32)",
      "orange-warm": "rgba(255, 132, 56, 0.32)",
      "blue-mist": "rgba(125, 157, 223, 0.30)",
      "emerald-chat": "rgba(46, 207, 114, 0.30)",
    } as const;

    for (const paletteId of Object.keys(
      expectedSelections,
    ) as (keyof typeof expectedSelections)[]) {
      const dark = getPalette(paletteId).dark;
      expect(dark["search-bg"]).toBe("rgba(255, 255, 255, 0.08)");
      expect(dark["msg-selected"]).toBe(expectedSelections[paletteId]);
    }
  });
});

describe("call message backgrounds", () => {
  it("uses pantone-like green shades for every palette and mode", () => {
    const expected = {
      "blue-cold": {
        light: "#cfe5d6",
        dark: "#1f4637",
      },
      "orange-warm": {
        light: "#d8e4c8",
        dark: "#31402d",
      },
      "blue-mist": {
        light: "#cfe6dc",
        dark: "#1f473d",
      },
      "emerald-chat": {
        light: "#cae9da",
        dark: "#1b4a39",
      },
    } as const;

    for (const [paletteId, shades] of Object.entries(expected)) {
      const palette = getPalette(paletteId);
      expect(palette.light["msg-call-bg"]).toBe(shades.light);
      expect(palette.light["call-bg"]).toBe(shades.light);
      expect(palette.dark["msg-call-bg"]).toBe(shades.dark);
      expect(palette.dark["call-bg"]).toBe(shades.dark);
    }
  });
});
