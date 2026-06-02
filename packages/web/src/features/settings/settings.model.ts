/**
 * Application settings store — persisted to localStorage.
 *
 * Manages user preferences for chat sorting, notification sounds, and language.
 * Falls back to sensible defaults on parse error or missing data.
 */

import { create } from "zustand";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { setLocale } from "~/i18n/i18n";
import { logStoreAction } from "~/shared/lib/logger";
import { buildOrgScopedStorageKey } from "~/shared/lib/org-scoped-storage";
import { resolveAuthIdleTimeout } from "./auth-idle-timeout.lib";
import type {
  AppLanguage,
  AppSettings,
  AuthIdleTimeout,
  ChatListDensity,
  FolderRailLayout,
  NotificationSound,
} from "./settings.types";

const STORAGE_KEY = "workspace-settings";

function getActiveOrganizationId(): string | null {
  return useInstancesStore.getState().currentInstanceId;
}

function getStorageKeyForOrganization(organizationId: string | null): string {
  return buildOrgScopedStorageKey(STORAGE_KEY, organizationId);
}

function resolveBrowserLanguage(): AppLanguage {
  if (typeof navigator === "undefined") return "en";

  const candidates = [
    navigator.language,
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
  ];

  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase();
    if (normalized.startsWith("ru")) return "ru";
    if (normalized.startsWith("en")) return "en";
  }

  return "en";
}

function createDefaultSettings(): AppSettings {
  return {
    prioritizePersonalUnread: false,
    prioritizeUnmutedUnreadChannels: false,
    notificationSound: "default",
    language: resolveBrowserLanguage(),
    folderRailLayout: "vertical",
    showSystemFolders: true,
    chatListDensity: "standard",
    authIdleTimeout: "3d",
  };
}

const DEFAULT_SETTINGS: AppSettings = createDefaultSettings();

const FALLBACK_SETTINGS: Omit<AppSettings, "language"> = {
  prioritizePersonalUnread: false,
  prioritizeUnmutedUnreadChannels: false,
  notificationSound: "default",
  folderRailLayout: "horizontal",
  showSystemFolders: true,
  chatListDensity: "standard",
  authIdleTimeout: "3d",
};

function resolveFolderRailLayout(value: unknown): FolderRailLayout {
  return value === "vertical" ? "vertical" : "horizontal";
}

function resolveNotificationSound(value: unknown): NotificationSound {
  if (
    value === "default" ||
    value === "subtle" ||
    value === "digital" ||
    value === "glass" ||
    value === "pulse" ||
    value === "none"
  ) {
    return value;
  }
  return FALLBACK_SETTINGS.notificationSound;
}

function resolveShowSystemFolders(value: unknown): boolean {
  if (value === true) return true;
  if (value === false) return false;
  return DEFAULT_SETTINGS.showSystemFolders;
}

function resolveChatListDensity(value: unknown): ChatListDensity {
  return value === "compact" ? "compact" : FALLBACK_SETTINGS.chatListDensity;
}

function loadSettings(organizationId: string | null = getActiveOrganizationId()): AppSettings {
  if (typeof window === "undefined") return createDefaultSettings();
  try {
    const scopedKey = getStorageKeyForOrganization(organizationId);
    const raw = localStorage.getItem(scopedKey);
    if (!raw) return createDefaultSettings();
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const prioritizePersonalUnread =
      typeof parsed.prioritizePersonalUnread === "boolean"
        ? parsed.prioritizePersonalUnread
        : DEFAULT_SETTINGS.prioritizePersonalUnread;
    const prioritizeUnmutedUnreadChannels =
      typeof parsed.prioritizeUnmutedUnreadChannels === "boolean"
        ? parsed.prioritizeUnmutedUnreadChannels
        : DEFAULT_SETTINGS.prioritizeUnmutedUnreadChannels;
    const language =
      parsed.language === "ru" || parsed.language === "en"
        ? parsed.language
        : resolveBrowserLanguage();
    return {
      prioritizePersonalUnread,
      prioritizeUnmutedUnreadChannels,
      notificationSound: resolveNotificationSound(parsed.notificationSound),
      language,
      folderRailLayout: resolveFolderRailLayout(parsed.folderRailLayout),
      showSystemFolders: resolveShowSystemFolders(parsed.showSystemFolders),
      chatListDensity: resolveChatListDensity(parsed.chatListDensity),
      authIdleTimeout: resolveAuthIdleTimeout(
        parsed.authIdleTimeout,
        FALLBACK_SETTINGS.authIdleTimeout,
      ),
    };
  } catch {
    return createDefaultSettings();
  }
}

function persistSettings(
  settings: AppSettings,
  organizationId: string | null = getActiveOrganizationId(),
): void {
  if (typeof window === "undefined") return;
  try {
    const scopedKey = getStorageKeyForOrganization(organizationId);
    localStorage.setItem(scopedKey, JSON.stringify(settings));
  } catch {
    /* quota exceeded */
  }
}

interface SettingsState extends AppSettings {
  setPrioritizePersonalUnread: (enabled: boolean) => void;
  setPrioritizeUnmutedUnreadChannels: (enabled: boolean) => void;
  setNotificationSound: (sound: NotificationSound) => void;
  setLanguage: (language: AppLanguage) => void;
  setFolderRailLayout: (layout: FolderRailLayout) => void;
  setShowSystemFolders: (enabled: boolean) => void;
  setChatListDensity: (density: ChatListDensity) => void;
  setAuthIdleTimeout: (timeout: AuthIdleTimeout) => void;
  resetToDefaults: () => void;
}

const initial = loadSettings();

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...initial,

  setPrioritizePersonalUnread(enabled) {
    logStoreAction("settings", "setPrioritizePersonalUnread", { enabled });
    set({ prioritizePersonalUnread: enabled });
    persistSettings({ ...get(), prioritizePersonalUnread: enabled });
  },

  setPrioritizeUnmutedUnreadChannels(enabled) {
    logStoreAction("settings", "setPrioritizeUnmutedUnreadChannels", { enabled });
    set({ prioritizeUnmutedUnreadChannels: enabled });
    persistSettings({ ...get(), prioritizeUnmutedUnreadChannels: enabled });
  },

  setNotificationSound(sound) {
    logStoreAction("settings", "setNotificationSound", { sound });
    set({ notificationSound: sound });
    persistSettings({ ...get(), notificationSound: sound });
  },

  setLanguage(language) {
    logStoreAction("settings", "setLanguage", { language });
    set({ language });
    persistSettings({ ...get(), language });
    setLocale(language);
  },

  setFolderRailLayout(folderRailLayout) {
    logStoreAction("settings", "setFolderRailLayout", { folderRailLayout });
    set({ folderRailLayout });
    persistSettings({ ...get(), folderRailLayout });
  },

  setShowSystemFolders(showSystemFolders) {
    logStoreAction("settings", "setShowSystemFolders", { showSystemFolders });
    set({ showSystemFolders });
    persistSettings({ ...get(), showSystemFolders });
  },

  setChatListDensity(chatListDensity) {
    logStoreAction("settings", "setChatListDensity", { chatListDensity });
    set({ chatListDensity });
    persistSettings({ ...get(), chatListDensity });
  },

  setAuthIdleTimeout(authIdleTimeout) {
    logStoreAction("settings", "setAuthIdleTimeout", { authIdleTimeout });
    set({ authIdleTimeout });
    persistSettings({ ...get(), authIdleTimeout });
  },

  resetToDefaults() {
    logStoreAction("settings", "resetToDefaults", {});
    const defaults = createDefaultSettings();
    set(defaults);
    persistSettings(defaults);
    setLocale(defaults.language);
  },
}));

if (typeof window !== "undefined") {
  setLocale(initial.language);

  let previousOrganizationId = useInstancesStore.getState().currentInstanceId;
  useInstancesStore.subscribe((state) => {
    const nextOrganizationId = state.currentInstanceId;
    if (nextOrganizationId === previousOrganizationId) {
      return;
    }

    previousOrganizationId = nextOrganizationId;
    const nextSettings = loadSettings(nextOrganizationId);
    useSettingsStore.setState(nextSettings);
    setLocale(nextSettings.language);
  });
}
