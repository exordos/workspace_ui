/**
 * When to show the in-app notification permission prompt.
 */

import type { NotificationPermissionStatus } from "~/shared/lib/notifications";

const DISMISS_STORAGE_PREFIX = "workspace-notification-prompt-dismissed:";

export function buildNotificationPromptDismissKey(organizationId: string | null): string {
  return `${DISMISS_STORAGE_PREFIX}${organizationId ?? "default"}`;
}

export function readNotificationPromptDismissed(organizationId: string | null): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(buildNotificationPromptDismissKey(organizationId)) === "1";
  } catch {
    return false;
  }
}

export function writeNotificationPromptDismissed(organizationId: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(buildNotificationPromptDismissKey(organizationId), "1");
  } catch {
    /* ignore */
  }
}

export function shouldShowNotificationPermissionBanner(options: {
  enabled: boolean;
  permission: NotificationPermissionStatus;
  dismissed: boolean;
  notificationsSupported: boolean;
}): boolean {
  if (!options.enabled) return false;
  if (!options.notificationsSupported) return false;
  if (options.dismissed) return false;
  return options.permission === "default";
}
