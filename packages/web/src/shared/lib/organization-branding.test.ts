import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ORGANIZATION_FALLBACK_LOGO_URL,
  getOrganizationLogoSrc,
  resolveOrganizationLogoUrl,
  setOrganizationFaviconHref,
  syncOrganizationFavicon,
} from "./organization-branding";

describe("organization-branding", () => {
  afterEach(() => {
    const dynamic = document.getElementById("organization-favicon");
    dynamic?.remove();
  });

  it("returns null for invalid organization logo urls", () => {
    expect(resolveOrganizationLogoUrl("")).toBeNull();
    expect(resolveOrganizationLogoUrl("   ")).toBeNull();
    expect(resolveOrganizationLogoUrl("mailto:logo@example.com")).toBeNull();
  });

  it("returns normalized logo url for valid organization logos", () => {
    expect(resolveOrganizationLogoUrl("https://cdn.example.com/logo.svg")).toBe(
      "https://cdn.example.com/logo.svg",
    );
  });

  it("returns fallback logo when organization logo is missing", () => {
    expect(getOrganizationLogoSrc()).toBe(ORGANIZATION_FALLBACK_LOGO_URL);
    expect(getOrganizationLogoSrc("")).toBe(ORGANIZATION_FALLBACK_LOGO_URL);
  });

  it("uses organization logo when available", () => {
    expect(getOrganizationLogoSrc("https://cdn.example.com/logo.svg")).toBe(
      "https://cdn.example.com/logo.svg",
    );
  });

  it("creates and updates dynamic favicon link", () => {
    setOrganizationFaviconHref("https://cdn.example.com/favicon-a.svg");
    setOrganizationFaviconHref("https://cdn.example.com/favicon-b.svg");

    const dynamic = document.getElementById("organization-favicon");
    expect(dynamic).toBeInstanceOf(HTMLLinkElement);
    expect(dynamic).toHaveAttribute("rel", "icon");
    expect(dynamic).toHaveAttribute("href", "https://cdn.example.com/favicon-b.svg");
  });

  it("syncs fallback favicon when organization logo is missing", () => {
    syncOrganizationFavicon();

    const dynamic = document.getElementById("organization-favicon");
    expect(dynamic).toHaveAttribute("href", ORGANIZATION_FALLBACK_LOGO_URL);
  });

  it("falls back favicon when organization logo cannot be loaded", () => {
    class BrokenImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        this.onerror?.();
      }
    }

    vi.stubGlobal("Image", BrokenImage as unknown as typeof Image);
    syncOrganizationFavicon("https://cdn.example.com/broken.svg");

    const dynamic = document.getElementById("organization-favicon");
    expect(dynamic).toHaveAttribute("href", ORGANIZATION_FALLBACK_LOGO_URL);
    vi.unstubAllGlobals();
  });
});
