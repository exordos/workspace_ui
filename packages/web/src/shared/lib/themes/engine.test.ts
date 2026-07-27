/**
 * Tests for the theme engine — applies palette tokens as CSS custom properties.
 *
 * applyTheme resolves light/dark/system mode, sets CSS variables on :root,
 * and updates data-theme/data-palette attributes. A broken engine results
 * in invisible text, wrong colors, or themes that don't switch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, getResolvedMode, CSS_VAR_PREFIX } from "./engine";

describe("getResolvedMode", () => {
  it("returns 'light' for explicit light mode", () => {
    expect(getResolvedMode("light")).toBe("light");
  });

  it("returns 'dark' for explicit dark mode", () => {
    expect(getResolvedMode("dark")).toBe("dark");
  });

  it("returns based on matchMedia for system mode", () => {
    const result = getResolvedMode("system");
    expect(["light", "dark"]).toContain(result);
  });

  it("resolves system mode to dark when prefers-color-scheme is dark", () => {
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockReturnValue({ matches: true }),
      writable: true,
      configurable: true,
    });

    expect(getResolvedMode("system")).toBe("dark");

    Object.defineProperty(window, "matchMedia", {
      value: original,
      writable: true,
      configurable: true,
    });
  });

  it("resolves system mode to light when prefers-color-scheme is light", () => {
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockReturnValue({ matches: false }),
      writable: true,
      configurable: true,
    });

    expect(getResolvedMode("system")).toBe("light");

    Object.defineProperty(window, "matchMedia", {
      value: original,
      writable: true,
      configurable: true,
    });
  });
});

describe("CSS_VAR_PREFIX", () => {
  it("is '--color-'", () => {
    expect(CSS_VAR_PREFIX).toBe("--color-");
  });
});

describe("applyTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-palette");
  });

  afterEach(() => {
    document.documentElement.style.cssText = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-palette");
  });

  it("sets data-theme attribute on root element", () => {
    applyTheme("orange-warm", "dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("sets data-palette attribute on root element", () => {
    applyTheme("orange-warm", "dark");
    expect(document.documentElement.dataset.palette).toBe("orange-warm");
  });

  it("sets CSS custom properties for palette tokens", () => {
    applyTheme("orange-warm", "dark");
    const bgValue = document.documentElement.style.getPropertyValue("--color-bg");
    expect(bgValue).toBeTruthy();
  });

  it("applies light theme tokens when mode is light", () => {
    applyTheme("orange-warm", "light");
    expect(document.documentElement.dataset.theme).toBe("light");

    const bgValue = document.documentElement.style.getPropertyValue("--color-bg");
    expect(bgValue).toBeTruthy();
  });

  it("applies blue-cold palette tokens", () => {
    applyTheme("blue-cold", "dark");
    expect(document.documentElement.dataset.palette).toBe("blue-cold");

    const accentValue = document.documentElement.style.getPropertyValue("--color-accent");
    expect(accentValue).toBeTruthy();
  });

  it("applies blue-mist palette tokens", () => {
    applyTheme("blue-mist", "dark");
    expect(document.documentElement.dataset.palette).toBe("blue-mist");

    const accentValue = document.documentElement.style.getPropertyValue("--color-accent");
    expect(accentValue).toBeTruthy();
  });

  it("falls back to first palette for unknown palette id", () => {
    applyTheme("nonexistent-palette", "dark");
    expect(document.documentElement.dataset.palette).toBe("nonexistent-palette");

    const bgValue = document.documentElement.style.getPropertyValue("--color-bg");
    expect(bgValue).toBeTruthy();
  });

  it("sets meta theme-color when meta element exists", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = "";
    document.head.appendChild(meta);

    applyTheme("orange-warm", "dark");

    expect(meta.content).toBeTruthy();
    document.head.removeChild(meta);
  });

  it("does not throw when meta theme-color is absent", () => {
    const existingMeta = document.querySelector('meta[name="theme-color"]');
    existingMeta?.remove();

    expect(() => applyTheme("orange-warm", "dark")).not.toThrow();
  });

  it("sets multiple CSS variables for different tokens", () => {
    applyTheme("orange-warm", "dark");

    const tokens = ["bg", "accent", "danger", "text-primary", "sidebar-bg"];
    for (const token of tokens) {
      const val = document.documentElement.style.getPropertyValue(`--color-${token}`);
      expect(val).toBeTruthy();
    }
  });

  it("overwrites previous theme when called again", () => {
    applyTheme("orange-warm", "dark");
    const darkBg = document.documentElement.style.getPropertyValue("--color-bg");

    applyTheme("orange-warm", "light");
    const lightBg = document.documentElement.style.getPropertyValue("--color-bg");

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(darkBg).not.toBe(lightBg);
  });
});
