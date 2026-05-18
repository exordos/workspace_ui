/**
 * Organization branding helpers for logos and tab favicon.
 *
 * Organization logos (`realm_icon`) are used in the UI (sidebar, instance switcher).
 * Tab favicon always uses the white-label app icon (`brand.logoUrl`), not the org logo.
 *
 * Zulip `realm_icon` may be an absolute URL or a realm-relative path (e.g.
 * `/user_avatars/…/realm/icon.png`); the latter is resolved against the org URL.
 */
import { brand } from "~/shared/lib/brand";
import { drawUnreadDotOnFavicon } from "~/shared/lib/favicon-unread.lib";
import { createLogger } from "~/shared/lib/logger";
import { isValidUrl } from "~/shared/lib/validation";

const brandingLog = createLogger("branding");

let faviconApplyGeneration = 0;

/**
 * Public `organization-fallback.svg` from `public/`.
 * Must use Vite `import.meta.env.BASE_URL` so Electron (`base: "./"`, `file://`) resolves
 * relative to the bundle, not the filesystem root (`file:///organization-fallback.svg`).
 */
export function getOrganizationFallbackLogoUrl(): string {
  return `${import.meta.env.BASE_URL}organization-fallback.svg`;
}

/** Default app favicon (white-label `VITE_BRAND_LOGO_URL`, usually `/favicon.svg`). */
export function getAppFaviconUrl(): string {
  return brand.logoUrl;
}

const ORGANIZATION_FAVICON_LINK_ID = "organization-favicon";

/** Static favicon pairs in `public/` — external org URLs are not mapped. */
const FAVICON_UNREAD_BY_NORMAL: Readonly<Record<string, string>> = {
  "favicon.svg": "favicon-unread.svg",
  "organization-fallback.svg": "organization-fallback-unread.svg",
};

function getFaviconFileName(href: string): string | null {
  const trimmed = href.trim();
  if (trimmed.length === 0) return null;
  const withoutQuery = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
  const segments = withoutQuery.split("/");
  const fileName = segments[segments.length - 1];
  return fileName != null && fileName.length > 0 ? fileName : null;
}

/** Swaps known static favicon paths to their unread variant; leaves external URLs unchanged. */
export function resolveFaviconHref(baseHref: string, hasUnread: boolean): string {
  if (!hasUnread) return baseHref;
  const fileName = getFaviconFileName(baseHref);
  if (fileName == null) return baseHref;
  const unreadFileName = FAVICON_UNREAD_BY_NORMAL[fileName];
  if (unreadFileName == null) return baseHref;
  return baseHref.endsWith(fileName)
    ? `${baseHref.slice(0, -fileName.length)}${unreadFileName}`
    : baseHref;
}

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
  setDocumentFaviconHref(href);
}

/** Updates every tab favicon link (including static ones from index.html). */
export function setDocumentFaviconHref(href: string): void {
  if (typeof document === "undefined") return;

  const links = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="icon"], link[rel="shortcut icon"]',
  );
  if (links.length === 0) {
    const link = getOrCreateOrganizationFaviconLink();
    if (link != null) link.href = href;
    return;
  }

  for (const link of links) {
    link.href = href;
  }
}

function needsFaviconUnreadOverlay(baseHref: string, hasUnread: boolean): boolean {
  return hasUnread && resolveFaviconHref(baseHref, true) === baseHref;
}

async function resolveFaviconHrefWithUnread(baseHref: string, hasUnread: boolean): Promise<string> {
  const mapped = resolveFaviconHref(baseHref, hasUnread);
  if (!needsFaviconUnreadOverlay(baseHref, hasUnread)) {
    return mapped;
  }
  try {
    return await drawUnreadDotOnFavicon(baseHref);
  } catch {
    brandingLog.debug("favicon unread overlay fallback to static asset", {
      reason: "image_load_or_canvas_failed",
    });
    return resolveFaviconHref(getOrganizationFallbackLogoUrl(), true);
  }
}

function applyOrganizationFaviconHref(
  baseHref: string,
  hasUnread: boolean,
  isStale: () => boolean,
  generation: number,
): void {
  void resolveFaviconHrefWithUnread(baseHref, hasUnread).then((href) => {
    if (!isStale() && generation === faviconApplyGeneration) {
      setDocumentFaviconHref(href);
    }
  });
}

export function syncOrganizationFavicon(_realmIcon?: string, _realmBaseUrl?: string): () => void {
  return syncFaviconWithUnreadIndicator({ hasUnread: false });
}

export function syncFaviconWithUnreadIndicator(options: { hasUnread: boolean }): () => void {
  const { hasUnread } = options;
  const generation = ++faviconApplyGeneration;
  let cancelled = false;
  const isStale = () => cancelled || generation !== faviconApplyGeneration;

  applyOrganizationFaviconHref(getAppFaviconUrl(), hasUnread, isStale, generation);

  return () => {
    cancelled = true;
  };
}
