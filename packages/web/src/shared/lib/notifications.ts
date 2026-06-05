/**
 * Unified notification service.
 *
 * Three runtimes:
 * - Electron → ipcRenderer (native OS notifications via main process)
 * - PWA/Browser → Web Notifications API
 * - In-app toasts for user-action errors → `~/shared/lib/toast/toast`
 *
 * Usage:
 *   import { notificationService } from "~/lib/notifications";
 *   await notificationService.requestPermission();
 *   await notificationService.show({ title: "New message", body: "Hello!" });
 */

import { getElectronAPI } from "./electron";
import { getRuntime } from "./pwa";

export type NotificationPermissionStatus = "granted" | "denied" | "default" | "unsupported";

const ELECTRON_NOTIFICATION_PERMISSION_KEY = "workspace-electron-notifications-enabled";

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  clickRoute?: string;
  data?: Record<string, unknown>;
  silent?: boolean;
  onClick?: () => void;
}

export interface NotificationService {
  getPermission(): NotificationPermissionStatus;
  requestPermission(): Promise<NotificationPermissionStatus>;
  show(options: NotificationOptions): Promise<void>;
  closeByTag(tag: string): Promise<void>;
  setBadgeCount(count: number): Promise<void>;
  clearBadge(): Promise<void>;
  isSupported(): boolean;
}

function createElectronNotificationService(): NotificationService {
  function readLocalPermission(): NotificationPermissionStatus {
    try {
      return localStorage.getItem(ELECTRON_NOTIFICATION_PERMISSION_KEY) === "1"
        ? "granted"
        : "default";
    } catch {
      return "default";
    }
  }

  function writeLocalPermissionGranted(): void {
    try {
      localStorage.setItem(ELECTRON_NOTIFICATION_PERMISSION_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  return {
    getPermission: readLocalPermission,

    async requestPermission() {
      const api = getElectronAPI();
      if (api == null) return "unsupported";
      const shown = await api?.notifications.show(
        "Notifications enabled",
        "Workspace can now show desktop notifications.",
        {
          tag: "notification-permission-check",
          silent: false,
        },
      );
      if (shown === false) return "default";
      writeLocalPermissionGranted();
      return "granted";
    },

    async show({ title, body, tag, silent, clickRoute }) {
      const api = getElectronAPI();
      if (api) {
        await api.notifications.show(title, body, { tag, silent, clickRoute });
      }
    },

    async closeByTag(tag: string) {
      const api = getElectronAPI();
      if (api?.notifications.closeByTag) {
        await api.notifications.closeByTag(tag);
      }
    },

    async setBadgeCount(_count: number) {
      /* Electron badge managed via main process — extend IPC if needed */
    },

    async clearBadge() {},

    isSupported: () => true,
  };
}

function createWebNotificationService(): NotificationService {
  const activeNotificationsByTag = new Map<string, Notification>();

  return {
    getPermission(): NotificationPermissionStatus {
      if (!("Notification" in window)) return "unsupported";
      return Notification.permission;
    },

    async requestPermission(): Promise<NotificationPermissionStatus> {
      if (!("Notification" in window)) return "unsupported";
      const result = await Notification.requestPermission();
      return result;
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async show({ title, body, icon, tag, silent, onClick }) {
      if (!("Notification" in window) || Notification.permission !== "granted") return;

      if (tag != null && tag.length > 0) {
        activeNotificationsByTag.get(tag)?.close();
      }

      const notification = new Notification(title, {
        body,
        icon: icon ?? "/pwa-192x192.png",
        tag,
        silent,
      });

      if (tag != null && tag.length > 0) {
        activeNotificationsByTag.set(tag, notification);
        notification.onclose = () => {
          if (activeNotificationsByTag.get(tag) === notification) {
            activeNotificationsByTag.delete(tag);
          }
        };
      }

      if (onClick) {
        notification.onclick = () => {
          window.focus();
          onClick();
          notification.close();
        };
      }
    },

    closeByTag(tag: string) {
      const notification = activeNotificationsByTag.get(tag);
      if (!notification) return Promise.resolve();
      activeNotificationsByTag.delete(tag);
      notification.close();
      return Promise.resolve();
    },

    async setBadgeCount(count: number) {
      if ("setAppBadge" in navigator) {
        await (navigator as Navigator & { setAppBadge: (n: number) => Promise<void> }).setAppBadge(
          count,
        );
      }
    },

    async clearBadge() {
      if ("clearAppBadge" in navigator) {
        await (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge();
      }
    },

    isSupported: () => "Notification" in window,
  };
}

let _service: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (_service) return _service;

  const runtime = getRuntime();
  _service =
    runtime === "electron" ? createElectronNotificationService() : createWebNotificationService();

  return _service;
}

export const notificationService = new Proxy({} as NotificationService, {
  get(_target, prop: keyof NotificationService) {
    return getNotificationService()[prop];
  },
});
