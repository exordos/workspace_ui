/**
 * Tests for the theme system: palette registry, token completeness, and mode resolution.
 *
 * Verifies that all registered palettes define the full set of 43 design tokens
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
  "call-red",
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
  it("each palette defines all 43 tokens for light mode", () => {
    for (const p of palettes) {
      for (const key of ALL_TOKEN_KEYS) {
        expect(p.light[key], `${p.id}.light.${key}`).toBeTruthy();
      }
    }
  });

  // Dark mode tokens are independent — each must be explicitly defined
  it("each palette defines all 43 tokens for dark mode", () => {
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
  it("matches Figma blueCold light V2 surface / bubble tokens", () => {
    const blueCold = getPalette("blue-cold");
    const light = blueCold.light;

    // Soft page underlay; white chrome panels must contrast with it
    expect(light.bg).toBe("#e4ecf3");
    expect(light["bg-elevated"]).toBe("#ffffff");
    expect(light["bg-elevated"]).not.toBe(light.bg);
    expect(light.accent).toBe("#7087ff");
    expect(light["on-accent"]).toBe("#1b1b1d");

    expect(light["text-primary"]).toBe("#1b1b1d");
    expect(light["text-secondary"]).toBe("#787878");
    expect(light["text-muted"]).toBe("#989898");

    expect(light["icon-base"]).toBe("#989898");
    expect(light["icon-disable"]).toBe("#474747");
    expect(light["icon-hover"]).toBe("#cde6ff");
    expect(light["icon-active"]).toBe("#1b1b1d");

    // White peer bubbles on soft page; own #AED7FF; cards #EEF5FB on white chrome
    expect(light["msg-bg"]).toBe("#ffffff");
    expect(light["card-bg"]).toBe("#eef5fb");
    expect(light["card-bg"]).not.toBe(light["bg-elevated"]);
    expect(light["msg-time"]).toBe("#989898");
    expect(light["msg-own-bg"]).toBe("#aed7ff");
    expect(light["msg-call-bg"]).toBe("#e2ffe9");
    expect(light["call-bg"]).toBe("#e2ffe9");
    expect(light["msg-selected"]).toBe("#cde6ff");

    expect(light["card-bg-active"]).toBe("#cde6ff");
    expect(light["accent-soft"]).toBe("#cde6ff");
    expect(light["sidebar-bg"]).toBe("#ffffff");
    expect(light["sidebar-item-hover"]).toBe("#cde6ff");
    // Composer matches white sidebar/header chrome
    expect(light["composer-outer"]).toBe(light["bg-elevated"]);
    expect(light["composer-outer"]).toBe("#ffffff");
    expect(light["composer-icon"]).toBe("#989898");

    expect(light["notice-base"]).toBe("#7087ff");
    expect(light["notice-disable"]).toBe("#989898");
    expect(light["badge-text"]).toBe("#ffffff");
    expect(light["badge-bg"]).toBe("#7087ff");

    expect(light["text-field-bg"]).toBe("#eef5fb");
    expect(light["search-bg"]).toBe("#eef5fb");
    expect(light["search-hint"]).toBe("#989898");
    expect(light["border-subtle"]).toBe("#d8e4ef");
    expect(light["call-red"]).toBe("#e43535");

    expect(light["indicator-yellow"]).toBe("#ffd633");
    expect(light["indicator-pink"]).toBe("#f458d2");
    expect(light["indicator-purple"]).toBe("#8d6dff");
    expect(light["indicator-orange"]).toBe("#ff8900");
    expect(light["indicator-green"]).toBe("#26c038");
  });
});

describe("blue-cold dark palette spec", () => {
  it("keeps Surface chrome darker than Card underlay so sidebar cards contrast", () => {
    const dark = getPalette("blue-cold").dark;

    // Figma dark: Background / Surface / Card base
    expect(dark.bg).toBe("#141517");
    expect(dark["bg-elevated"]).toBe("#222328");
    expect(dark["card-bg"]).toBe("#282a32");
    expect(dark["card-bg-active"]).toBe("#2c3747");
    // Chrome must not equal cards — otherwise list cards dissolve into the panel
    expect(dark["bg-elevated"]).not.toBe(dark["card-bg"]);

    expect(dark["sidebar-bg"]).toBe("#222328");
    expect(dark["sidebar-item-hover"]).toBe(dark["card-bg-active"]);
    expect(dark["sidebar-item-hover"]).toBe("#2c3747");
    // Composer Surface matches sidebar/header chrome
    expect(dark["composer-outer"]).toBe(dark["bg-elevated"]);
    expect(dark["composer-outer"]).toBe("#222328");
  });
});

describe("orange-warm light palette spec", () => {
  it("matches Figma light Surface / Card tokens", () => {
    const orangeWarm = getPalette("orange-warm");
    const light = orangeWarm.light;

    expect(light.bg).toBe("#e6e6e6");
    expect(light["bg-elevated"]).toBe("#ffffff");
    expect(light.accent).toBe("#ff8438");
    expect(light["on-accent"]).toBe("#1b1b1d");

    expect(light["text-primary"]).toBe("#1b1b1d");
    expect(light["text-secondary"]).toBe("#787878");
    expect(light["text-muted"]).toBe("#989898");

    // Surface chrome vs Card/background base for sidebar cards
    expect(light["card-bg"]).toBe("#f5f5f5");
    expect(light["card-bg-active"]).toBe("#ffe7cc");
    expect(light["accent-soft"]).toBe("#ffe7cc");
    expect(light["sidebar-bg"]).toBe("#ffffff");
    expect(light["sidebar-item-hover"]).toBe("#ffe7cc");
    expect(light["composer-outer"]).toBe("#ffffff");
    expect(light["composer-outer"]).toBe(light["bg-elevated"]);

    expect(light["msg-bg"]).toBe("#ffffff");
    expect(light["msg-own-bg"]).toBe("#fff1e2");
    expect(light["msg-call-bg"]).toBe("#e2ffe9");
    expect(light["call-bg"]).toBe("#e2ffe9");
    expect(light["msg-time"]).toBe("#989898");
    expect(light["msg-selected"]).toBe("#ffd9ae");

    expect(light["icon-base"]).toBe("#989898");
    expect(light["icon-disable"]).toBe("#474747");
    expect(light["icon-hover"]).toBe("#ffe7cc");
    expect(light["icon-active"]).toBe("#1b1b1d");

    expect(light["text-field-bg"]).toBe("#e6e6e6");
    expect(light["search-bg"]).toBe("#e6e6e6");
    expect(light["search-hint"]).toBe("#989898");
    expect(light["border-subtle"]).toBe("#d9d9d9");

    expect(light["notice-base"]).toBe("#ff8438");
    expect(light["notice-disable"]).toBe("#989898");
    expect(light["badge-bg"]).toBe("#ff8438");
    expect(light["badge-text"]).toBe("#ffffff");
    expect(light["call-red"]).toBe("#e43535");
  });
});

describe("orange-warm dark palette spec", () => {
  it("keeps Surface chrome darker than Card underlay so sidebar cards contrast", () => {
    const dark = getPalette("orange-warm").dark;

    // Figma dark: Background / Surface / Card base
    expect(dark.bg).toBe("#1b1b1d");
    expect(dark["bg-elevated"]).toBe("#333333");
    expect(dark["card-bg"]).toBe("#373737");
    expect(dark["card-bg-active"]).toBe("#4b4b4b");
    // Chrome must not equal cards — otherwise list cards dissolve into the panel
    expect(dark["bg-elevated"]).not.toBe(dark["card-bg"]);

    expect(dark["sidebar-bg"]).toBe("#333333");
    expect(dark["sidebar-item-hover"]).toBe(dark["card-bg-active"]);
    expect(dark["sidebar-item-hover"]).toBe("#4b4b4b");
    // Composer Surface matches sidebar/header chrome
    expect(dark["composer-outer"]).toBe(dark["bg-elevated"]);
    expect(dark["composer-outer"]).toBe("#333333");
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

    // Light Figma: white sidebar, darker soft-blue card underlay
    expect(light["card-bg"]).toBe("#eff5fb");
    expect(light["card-bg-active"]).toBe("#d5e5f6");
    expect(light["sidebar-bg"]).toBe("#ffffff");
    expect(light["sidebar-item-hover"]).toBe("#e4edf7");
    expect(light["composer-outer"]).toBe("#eff5fb");
    expect(light["composer-outer"]).toBe(light["card-bg"]);

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

describe("blue-mist dark palette spec", () => {
  it("keeps Surface chrome darker than Card underlay so sidebar cards contrast", () => {
    const dark = getPalette("blue-mist").dark;

    // Composer kept the real Surface; chrome was wrongly glued to card-bg
    expect(dark["composer-outer"]).toBe("#232c38");
    expect(dark["bg-elevated"]).toBe("#232c38");
    expect(dark["card-bg"]).toBe("#243040");
    expect(dark["card-bg-active"]).toBe("#30465d");
    expect(dark["bg-elevated"]).not.toBe(dark["card-bg"]);

    expect(dark["sidebar-bg"]).toBe("#232c38");
    expect(dark["sidebar-item-hover"]).toBe(dark["card-bg-active"]);
    expect(dark["sidebar-item-hover"]).toBe("#30465d");
    expect(dark["composer-outer"]).toBe(dark["bg-elevated"]);
  });
});

describe("emerald-chat dark palette spec", () => {
  it("keeps Surface chrome darker than Card underlay so sidebar cards contrast", () => {
    const emeraldChat = getPalette("emerald-chat");
    const dark = emeraldChat.dark;

    // Old sidebar-bg (#2c2c2e) is the real Surface; chrome was wrongly glued to card-bg
    expect(dark.bg).toBe("#1b1b1d");
    expect(dark["bg-elevated"]).toBe("#2c2c2e");
    expect(dark["card-bg"]).toBe("#373737");
    expect(dark["card-bg-active"]).toBe("#4b4b4b");
    expect(dark["bg-elevated"]).not.toBe(dark["card-bg"]);

    expect(dark["sidebar-bg"]).toBe("#2c2c2e");
    expect(dark["sidebar-item-hover"]).toBe(dark["card-bg-active"]);
    expect(dark["sidebar-item-hover"]).toBe("#4b4b4b");
    expect(dark["border-subtle"]).toBe("#3f3f45");
    // Composer matches sidebar/header Surface chrome
    expect(dark["composer-outer"]).toBe(dark["bg-elevated"]);
    expect(dark["composer-outer"]).toBe("#2c2c2e");
  });
});

describe("emerald-chat light palette spec", () => {
  it("keeps a darker gray card underlay on white sidebar chrome", () => {
    const light = getPalette("emerald-chat").light;

    expect(light["card-bg"]).toBe("#f0f0f0");
    expect(light["card-bg-active"]).toBe(light["accent-soft"]);
    expect(light["card-bg-active"]).toBe("#d9f1e4");
    expect(light["sidebar-bg"]).toBe("#ffffff");
    expect(light["sidebar-item-hover"]).toBe(light["accent-soft"]);
    expect(light["sidebar-item-hover"]).toBe("#d9f1e4");
    expect(light["sidebar-item-hover"]).not.toBe("#f0f0f0");
    // Composer matches white sidebar/header chrome, not gray card underlay
    expect(light["composer-outer"]).toBe(light["bg-elevated"]);
    expect(light["composer-outer"]).toBe("#ffffff");
  });
});

describe("dark palette structural contract", () => {
  it("aligns peer message bubbles with card chrome across dark palettes except emerald and blue-mist", () => {
    for (const paletteId of ["orange-warm", "blue-cold"] as const) {
      const dark = getPalette(paletteId).dark;
      expect(dark["msg-bg"], `${paletteId}.dark.msg-bg`).toBe(dark["card-bg"]);
    }
  });

  it("keeps emerald peer bubbles on the dedicated green-tinted msg-bg", () => {
    const dark = getPalette("emerald-chat").dark;
    expect(dark["msg-bg"]).toBe("#1f2f2a");
    expect(dark["msg-bg"]).not.toBe(dark["card-bg"]);
  });

  it("keeps blue-mist peer bubbles on the dedicated mock msg-bg", () => {
    const dark = getPalette("blue-mist").dark;
    expect(dark["msg-bg"]).toBe("#323c4a");
    expect(dark["msg-bg"]).not.toBe(dark["card-bg"]);
  });

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
        light: "#e2ffe9",
        dark: "#1f4637",
      },
      "orange-warm": {
        light: "#e2ffe9",
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
