/**
 * server-backed notification settings (per active organization).
 */

import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import {
  DEFAULT_MESSENGER_NOTIFICATION_SETTINGS,
  parseWorkspaceNotificationSettings,
  patchWorkspaceNotificationSettings,
  type WorkspaceNotificationSettings,
} from "~/shared/lib/messenger-notification-settings.lib";

interface NotificationSettingsState {
  settings: WorkspaceNotificationSettings;
  hydrated: boolean;
  setFromServer: (raw: Record<string, unknown> | null | undefined) => void;
  patchSetting: (property: string, value: unknown) => void;
  clear: () => void;
}

export const useNotificationSettingsStore = create<NotificationSettingsState>((set, get) => ({
  settings: { ...DEFAULT_MESSENGER_NOTIFICATION_SETTINGS },
  hydrated: false,

  setFromServer(raw) {
    const parsed = parseWorkspaceNotificationSettings(raw ?? undefined);
    logStoreAction("notificationSettings", "setFromServer", {
      enableDesktop: parsed.enableDesktopNotifications,
      enableStreamDesktop: parsed.enableStreamDesktopNotifications,
    });
    set({ settings: parsed, hydrated: raw != null });
  },

  patchSetting(property, value) {
    const next = patchWorkspaceNotificationSettings(get().settings, property, value);
    logStoreAction("notificationSettings", "patchSetting", { property });
    set({ settings: next, hydrated: true });
  },

  clear() {
    logStoreAction("notificationSettings", "clear", {});
    set({ settings: { ...DEFAULT_MESSENGER_NOTIFICATION_SETTINGS }, hydrated: false });
  },
}));

export type { WorkspaceNotificationSettings };
