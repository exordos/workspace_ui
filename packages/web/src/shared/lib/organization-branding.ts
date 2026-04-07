/**
 * Organization branding helpers for logo + favicon.
 *
 * Provides a single fallback asset for organization logos and keeps a dynamic
 * favicon link synchronized with the currently selected organization.
 */
import { isValidUrl } from "~/shared/lib/validation";

export const ORGANIZATION_FALLBACK_LOGO_URL = "/organization-fallback.svg";
const ORGANIZATION_FAVICON_LINK_ID = "organization-favicon";

export function resolveOrganizationLogoUrl(realmIcon?: string): string | null {
  if (realmIcon == null) return null;
  const trimmed = realmIcon.trim();
  if (trimmed.length === 0) return null;
  return isValidUrl(trimmed) ? trimmed : null;
}

export function getOrganizationLogoSrc(realmIcon?: string): string {
  return resolveOrganizationLogoUrl(realmIcon) ?? ORGANIZATION_FALLBACK_LOGO_URL;
}

function getOrCreateOrganizationFaviconLink(): HTMLLinkElement | null {
  if (typeof document === "undefined") return null;

  const existing = document.getElementById(ORGANIZATION_FAVICON_LINK_ID);
  if (existing instanceof HTMLLinkElement) {
    return existing;
  }

  const link = document.createElement("link");
  link.id = ORGANIZATION_FAVICON_LINK_ID;
  link.rel = "icon";
  document.head.appendChild(link);
  return link;
}

export function setOrganizationFaviconHref(href: string): void {
  const link = getOrCreateOrganizationFaviconLink();
  if (link == null) return;
  link.href = href;
}

export function syncOrganizationFavicon(realmIcon?: string): () => void {
  const targetSrc = getOrganizationLogoSrc(realmIcon);
  if (targetSrc === ORGANIZATION_FALLBACK_LOGO_URL || typeof Image === "undefined") {
    setOrganizationFaviconHref(targetSrc);
    return () => {};
  }

  let cancelled = false;
  const probe = new Image();
  probe.onload = () => {
    if (!cancelled) {
      setOrganizationFaviconHref(targetSrc);
    }
  };
  probe.onerror = () => {
    if (!cancelled) {
      setOrganizationFaviconHref(ORGANIZATION_FALLBACK_LOGO_URL);
    }
  };
  probe.src = targetSrc;

  return () => {
    cancelled = true;
  };
}
