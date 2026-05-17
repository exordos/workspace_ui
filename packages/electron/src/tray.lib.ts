/**
 * Tray context menu labels and internal navigation routes.
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
}

const LABELS_EN: TrayMenuLabels = {
  messenger: "Messenger",
  calendar: "Calendar",
  mail: "Mail",
  quit: "Quit",
};

const LABELS_RU: TrayMenuLabels = {
  messenger: "Мессенджер",
  calendar: "Календарь",
  mail: "Почта",
  quit: "Выход",
};

/** Resolves tray menu labels from a BCP-47 locale string (e.g. `app.getLocale()`). */
export function getTrayMenuLabels(locale: string): TrayMenuLabels {
  const normalized = locale.trim().toLowerCase();
  if (normalized.startsWith("ru")) {
    return LABELS_RU;
  }
  return LABELS_EN;
}
