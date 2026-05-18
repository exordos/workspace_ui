/**
 * Tray context menu labels, Windows taskbar overlay text, and internal navigation routes.
 *
 * Routes are sent to the renderer via `deeplink:navigate` and prefixed with the
 * current org scope in the React app (`withCurrentOrgRoute`).
 */

/** Resolved in the renderer to the last opened messenger chat. */
export const TRAY_NAV_ROUTES = {
  messenger: "/open/messenger",
  calendar: "/calendar",
  mail: "/mail",
} as const;

export type TrayNavRoute = (typeof TRAY_NAV_ROUTES)[keyof typeof TRAY_NAV_ROUTES];

export interface TrayMenuLabels {
  messenger: string;
  calendar: string;
  mail: string;
  quit: string;
  /** Windows taskbar thumbnail overlay description (screen reader / tooltip). */
  unreadTaskbarOverlay: string;
}

const LABELS_EN: TrayMenuLabels = {
  messenger: "Messenger",
  calendar: "Calendar",
  mail: "Mail",
  quit: "Quit",
  unreadTaskbarOverlay: "Unread messages",
};

const LABELS_RU: TrayMenuLabels = {
  messenger: "Мессенджер",
  calendar: "Календарь",
  mail: "Почта",
  quit: "Выход",
  unreadTaskbarOverlay: "Непрочитанные сообщения",
};

/** Resolves tray menu labels from a BCP-47 locale string (e.g. `app.getLocale()`). */
export function getTrayMenuLabels(locale: string): TrayMenuLabels {
  const normalized = locale.trim().toLowerCase();
  if (normalized.startsWith("ru")) {
    return LABELS_RU;
  }
  return LABELS_EN;
}

const TRAY_ICON_CANDIDATES: Readonly<Record<string, readonly string[]>> = {
  darwin: ["tray-icon-mac.png", "icons/16x16.png", "icon.png"],
  default: ["tray-icon.png", "icons/16x16.png", "icon.png"],
};

const TRAY_ICON_UNREAD_SUFFIX = "-unread";

/** macOS Dock runtime icons (`app.dock.setIcon`) — unread dot baked into PNG. */
export const DOCK_ICON_FILES = {
  normal: "dock-icon.png",
  unread: "dock-icon-unread.png",
} as const;

/** Resolves tray PNG file name for the current platform (used by main process). */
export function resolveTrayIconFileName(platform: NodeJS.Platform, unread: boolean): string | null {
  const candidates =
    platform === "darwin" ? TRAY_ICON_CANDIDATES.darwin : TRAY_ICON_CANDIDATES.default;
  const primary = candidates[0];
  if (primary == null) return null;
  if (!unread) return primary;
  const dot = primary.replace(/\.png$/i, `${TRAY_ICON_UNREAD_SUFFIX}.png`);
  return dot.length > primary.length ? dot : null;
}

/** Resolves Dock PNG file name (macOS only). */
export function resolveDockIconFileName(unread: boolean): string {
  return unread ? DOCK_ICON_FILES.unread : DOCK_ICON_FILES.normal;
}
