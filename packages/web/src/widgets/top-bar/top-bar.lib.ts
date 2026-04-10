import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { extractOrgRouteFromPathname } from "~/shared/lib/org-route";
import type { TopBarSection, TopBarSectionNavItem } from "./top-bar.types";

/** Maps the current pathname (including `/org/:id/...`) to the top-bar app section. */
export function getSectionFromPathname(pathname: string): TopBarSection {
  const { scopedPathname } = extractOrgRouteFromPathname(pathname);
  if (scopedPathname.startsWith("/calendar")) return "calendar";
  if (scopedPathname.startsWith("/mail")) return "mail";
  if (scopedPathname.startsWith("/calls")) return "calls";
  if (scopedPathname.startsWith("/services") || scopedPathname.startsWith("/all-services")) {
    return "services";
  }
  return "chat";
}

export function formatDownloadBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function resolveTopBarAvatarSrc(url: string | undefined | null): string | undefined {
  return resolveAvatarUrl(url, getRealmBaseUrl());
}

export function getTopBarSectionNavItems(options: {
  showCallsNav: boolean;
  showServicesNav: boolean;
}): TopBarSectionNavItem[] {
  const items: TopBarSectionNavItem[] = [
    { id: "chat", icon: "chatBubble", label: t("nav.chatsAndChannels"), available: true },
    { id: "calendar", icon: "calendar", label: t("nav.calendar"), available: true },
    { id: "mail", icon: "mail", label: t("nav.mail"), available: true },
  ];
  if (options.showCallsNav) {
    items.push({ id: "calls", icon: "phone", label: t("nav.calls"), available: true });
  }
  if (options.showServicesNav) {
    items.push({ id: "services", icon: "grid", label: t("nav.services"), available: true });
  }
  return items;
}

/** When the current route maps to a section not shown in the nav, highlight chat instead. */
export function resolveTopBarActiveSection(
  pathnameSection: TopBarSection,
  visibleSectionIds: ReadonlySet<TopBarSection>,
): TopBarSection {
  return visibleSectionIds.has(pathnameSection) ? pathnameSection : "chat";
}
