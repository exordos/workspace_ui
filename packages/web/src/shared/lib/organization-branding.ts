/**
 * Organization branding helpers for logo + favicon.
 *
 * Provides a single fallback asset for organization logos and keeps a dynamic
 * favicon link synchronized with the currently selected organization.
 *
 * Zulip `realm_icon` may be an absolute URL or a realm-relative path (e.g.
 * `/user_avatars/…/realm/icon.png`); the latter is resolved against the org URL.
 */
import { isValidUrl } from "~/shared/lib/validation";

/**
 * Public `organization-fallback.svg` from `public/`.
 * Must use Vite `import.meta.env.BASE_URL` so Electron (`base: "./"`, `file://`) resolves
 * relative to the bundle, not the filesystem root (`file:///organization-fallback.svg`).
 */
export function getOrganizationFallbackLogoUrl(): string {
  return `${import.meta.env.BASE_URL}organization-fallback.svg`;
}

const ORGANIZATION_FAVICON_LINK_ID = "organization-favicon";

export function resolveOrganizationLogoUrl(
  realmIcon?: string,
  realmBaseUrl?: string,
): string | null {
  if (realmIcon == null) return null;
  const trimmed = realmIcon.trim();
  if (trimmed.length === 0) return null;
  if (isValidUrl(trimmed)) {
    return trimmed;
  }
  const baseTrimmed = realmBaseUrl?.trim() ?? "";
  if (baseTrimmed.length === 0) return null;
  const normalizedBase = baseTrimmed.replace(/\/+$/, "");
  if (!isValidUrl(normalizedBase)) return null;
  try {
    const resolved = new URL(trimmed, `${normalizedBase}/`).toString();
    return isValidUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

export function getOrganizationLogoSrc(realmIcon?: string, realmBaseUrl?: string): string {
  return resolveOrganizationLogoUrl(realmIcon, realmBaseUrl) ?? getOrganizationFallbackLogoUrl();
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

export function syncOrganizationFavicon(realmIcon?: string, realmBaseUrl?: string): () => void {
  const fallback = getOrganizationFallbackLogoUrl();
  const targetSrc = getOrganizationLogoSrc(realmIcon, realmBaseUrl);
  if (targetSrc === fallback || typeof Image === "undefined") {
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
      setOrganizationFaviconHref(fallback);
    }
  };
  probe.src = targetSrc;

  return () => {
    cancelled = true;
  };
}
