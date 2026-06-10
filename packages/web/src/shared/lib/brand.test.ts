/**
 * Tests for the white-label brand configuration module.
 *
 * The brand module provides all customizable identity values (name, logo,
 * colors, app ID) sourced from VITE_BRAND_* env vars. These tests ensure
 * that default values are valid and that the brand object always provides
 * the fields needed by index.html, PWA manifest, and UI components.
 * Missing or malformed brand values would break the app's visual identity.
 */

import { describe, expect, it } from "vitest";
import { brand } from "./brand";

// brand object is the single source of truth for all branding — never hardcode "Workspace"
describe("brand", () => {
  // App name is used in document.title, PWA manifest, and Electron window title
  it("has non-empty appName", () => {
    expect(brand.appName).toBeTruthy();
    expect(brand.appName.length).toBeGreaterThan(0);
  });

  it("defaults appName to Exordos Workspace when VITE_BRAND_APP_NAME is unset", () => {
    expect(brand.appName).toBe("Exordos Workspace");
  });

  // App ID is used for Electron packaging and PWA scope — must be a valid identifier
  it("has non-empty appId", () => {
    expect(brand.appId).toMatch(/^[\w.]+$/);
  });

  // Theme color is used in PWA manifest and mobile browser chrome — must be valid hex
  it("has valid themeColor hex", () => {
    expect(brand.themeColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  // Background color is used in splash screens and PWA manifest
  it("has valid backgroundColor hex", () => {
    expect(brand.backgroundColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  // Accent color is the brand's primary interaction color
  it("has valid accentColor hex", () => {
    expect(brand.accentColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("has valid unreadIndicatorColor hex", () => {
    expect(brand.unreadIndicatorColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  // Palette ID must map to an existing theme palette — prevents theme initialization crash
  it("defaultPaletteId is a known palette", () => {
    expect(["orange-warm", "blue-cold", "blue-mist", "emerald-chat"]).toContain(
      brand.defaultPaletteId,
    );
  });

  // Theme mode must be one of the two supported modes
  it("defaultThemeMode is light or dark", () => {
    expect(["light", "dark"]).toContain(brand.defaultThemeMode);
  });

  // All required string fields must be defined — missing values break UI rendering
  it("all string fields are defined", () => {
    const requiredStrings: (keyof typeof brand)[] = [
      "appName",
      "appShortName",
      "appDescription",
      "copyright",
      "companyName",
      "appId",
      "logoUrl",
    ];
    for (const key of requiredStrings) {
      expect(brand[key], `brand.${key} should be non-empty`).toBeTruthy();
    }
  });
});
