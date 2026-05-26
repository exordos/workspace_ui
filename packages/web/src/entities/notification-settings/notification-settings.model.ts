/**
 * Zulip server-backed notification settings (per active organization).
 */

import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import {
  DEFAULT_ZULIP_NOTIFICATION_SETTINGS,
  parseZulipNotificationSettings,
  patchZulipNotificationSettings,
  type ZulipNotificationSettings,
} from "~/shared/lib/zulip-notification-settings.lib";

interface NotificationSettingsState {
  settings: ZulipNotificationSettings;
  hydrated: boolean;
  setFromServer: (raw: Record<string, unknown> | null | undefined) => void;
  patchSetting: (property: string, value: unknown) => void;
  clear: () => void;
}

export const useNotificationSettingsStore = create<NotificationSettingsState>((set, get) => ({
  settings: { ...DEFAULT_ZULIP_NOTIFICATION_SETTINGS },
  hydrated: false,

  setFromServer(raw) {
    const parsed = parseZulipNotificationSettings(raw ?? undefined);
    logStoreAction("notificationSettings", "setFromServer", {
      enableDesktop: parsed.enableDesktopNotifications,
      enableStreamDesktop: parsed.enableStreamDesktopNotifications,
    });
    set({ settings: parsed, hydrated: raw != null });
  },

  patchSetting(property, value) {
    const next = patchZulipNotificationSettings(get().settings, property, value);
    logStoreAction("notificationSettings", "patchSetting", { property });
    set({ settings: next, hydrated: true });
  },

  clear() {
    logStoreAction("notificationSettings", "clear", {});
    set({ settings: { ...DEFAULT_ZULIP_NOTIFICATION_SETTINGS }, hydrated: false });
  },
}));

export type { ZulipNotificationSettings };
