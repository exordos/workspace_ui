import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useThemeStore } from "~/entities/theme";
import {
  useSettingsStore,
  type FolderRailLayout,
  type NotificationSound,
} from "~/features/settings";
import { getAvailablePalettes, selectPalette, selectMode } from "~/features/theme-picker";
import { useTranslation } from "~/i18n";
import { wipeCredentials } from "~/shared/lib/auth-guard";
import { createLogger } from "~/shared/lib/logger";
import { playNotificationSound } from "~/shared/lib/notification-sound";
import { pushService } from "~/shared/lib/push";
import type { ThemeMode } from "~/shared/lib/themes/tokens";
import { Icon } from "~/shared/ui";
import { ChatHeader } from "~/widgets/chat-view";

const log = createLogger("settings-page");
const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "dev";

const NOTIFICATION_SOUNDS: NotificationSound[] = [
  "default",
  "subtle",
  "digital",
  "glass",
  "pulse",
  "none",
];
const NOTIFICATION_SOUND_LABEL_KEYS: Record<NotificationSound, string> = {
  default: "settings.soundDefault",
  subtle: "settings.soundSubtle",
  digital: "settings.soundDigital",
  glass: "settings.soundGlass",
  pulse: "settings.soundPulse",
  none: "settings.soundNone",
};
const THEME_MODES: ThemeMode[] = ["light", "dark", "system"];
const THEME_MODE_LABEL_KEYS: Record<ThemeMode, string> = {
  light: "settings.themeLight",
  dark: "settings.themeDark",
  system: "settings.themeSystem",
};
const FOLDER_LAYOUTS: FolderRailLayout[] = ["vertical", "horizontal"];
const FOLDER_LAYOUT_LABEL_KEYS: Record<FolderRailLayout, string> = {
  vertical: "settings.folderLayoutVertical",
  horizontal: "settings.folderLayoutHorizontal",
};

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { t, locale: currentLocale, setLocale, supportedLocales: locales } = useTranslation();
  const prioritizePersonalUnread = useSettingsStore((s) => s.prioritizePersonalUnread);
  const prioritizeUnmutedUnreadChannels = useSettingsStore(
    (s) => s.prioritizeUnmutedUnreadChannels,
  );
  const setPrioritizePersonalUnread = useSettingsStore((s) => s.setPrioritizePersonalUnread);
  const setPrioritizeUnmutedUnreadChannels = useSettingsStore(
    (s) => s.setPrioritizeUnmutedUnreadChannels,
  );
  const notificationSound = useSettingsStore((s) => s.notificationSound);
  const setNotificationSound = useSettingsStore((s) => s.setNotificationSound);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const folderRailLayout = useSettingsStore((s) => s.folderRailLayout);
  const setFolderRailLayout = useSettingsStore((s) => s.setFolderRailLayout);
  const currentThemeMode = useThemeStore((s) => s.mode);
  const currentPaletteId = useThemeStore((s) => s.paletteId);
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);
  const [chatSortingSettingsOpen, setChatSortingSettingsOpen] = useState(false);
  const [folderLayoutSettingsOpen, setFolderLayoutSettingsOpen] = useState(false);
  const openPersonalInfo = useCallback(() => navigate("/settings/personal-info"), [navigate]);
  const openLogs = useCallback(() => navigate("/settings/logs"), [navigate]);
  const openBuilds = useCallback(() => navigate("/settings/build"), [navigate]);
  const toggleThemeSettings = useCallback(() => {
    setThemeSettingsOpen((open) => !open);
  }, []);
  const toggleChatSortingSettings = useCallback(() => {
    setChatSortingSettingsOpen((open) => !open);
  }, []);
  const toggleFolderLayoutSettings = useCallback(() => {
    setFolderLayoutSettingsOpen((open) => !open);
  }, []);
  const currentLocaleName =
    locales.find((supportedLocale) => supportedLocale.id === currentLocale)?.nativeLabel ??
    currentLocale;
  const availablePalettes = useMemo(() => getAvailablePalettes(), []);

  const handleCycleNotificationSound = useCallback(() => {
    const idx = NOTIFICATION_SOUNDS.indexOf(notificationSound);
    const next = NOTIFICATION_SOUNDS[(idx + 1) % NOTIFICATION_SOUNDS.length]!;
    setNotificationSound(next);
    if (next !== "none") {
      playNotificationSound(next);
    }
  }, [notificationSound, setNotificationSound]);

  const handleCycleLanguage = useCallback(() => {
    const idx = locales.findIndex((supportedLocale) => supportedLocale.id === currentLocale);
    const next = locales[(idx + 1) % locales.length]!;
    setLocale(next.id);
    setLanguage(next.id as "en" | "ru");
  }, [currentLocale, locales, setLocale, setLanguage]);

  const handleLogout = useCallback(() => {
    log.info("User initiated logout from settings page");
    void pushService.unregister().catch(() => {});
    wipeCredentials();
    void navigate("/login");
  }, [navigate]);

  const soundLabel = useMemo(
    () => t(NOTIFICATION_SOUND_LABEL_KEYS[notificationSound]),
    [notificationSound, t],
  );
  const handleTogglePrioritizePersonalUnread = useCallback(() => {
    setPrioritizePersonalUnread(!prioritizePersonalUnread);
  }, [prioritizePersonalUnread, setPrioritizePersonalUnread]);
  const handleTogglePrioritizeUnmutedUnreadChannels = useCallback(() => {
    setPrioritizeUnmutedUnreadChannels(!prioritizeUnmutedUnreadChannels);
  }, [prioritizeUnmutedUnreadChannels, setPrioritizeUnmutedUnreadChannels]);

  return (
    <div className="flex max-h-full min-h-0 min-w-0 max-w-[1199px] flex-1 flex-col overflow-hidden">
      <ChatHeader channelName={t("settings.settings")} hideTopic hideParticipants />
      <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
        <button
          type="button"
          onClick={openPersonalInfo}
          className="flex items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
        >
          <span className="flex items-center gap-3">
            <Icon name="profile" size={20} className="text-accent" />
            <span className="text-sm font-medium text-text-primary">
              {t("settings.personalInfo")}
            </span>
          </span>
          <Icon name="chevron-right" size={16} className="text-text-muted" />
        </button>
        <button
          type="button"
          onClick={openLogs}
          className="flex items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
        >
          <span className="flex items-center gap-3">
            <Icon name="grid" size={20} className="text-accent" />
            <span className="text-sm font-medium text-text-primary">
              {t("settings.connectionDiagnostics")}
            </span>
          </span>
          <Icon name="chevron-right" size={16} className="text-text-muted" />
        </button>
        <button
          type="button"
          onClick={openBuilds}
          className="flex items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
        >
          <span className="flex items-center gap-3">
            <Icon name="mood" size={20} className="text-accent" />
            <span className="text-sm font-medium text-text-primary">
              {t("settings.selectBuild")}
            </span>
          </span>
          <Icon name="chevron-right" size={16} className="text-text-muted" />
        </button>
        <button
          type="button"
          onClick={toggleThemeSettings}
          className="flex items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
          aria-expanded={themeSettingsOpen}
        >
          <span className="flex items-center gap-3">
            <Icon name="mood" size={20} className="text-accent" />
            <span className="text-sm font-medium text-text-primary">
              {t("settings.themeSettings")}
            </span>
          </span>
          <Icon name="chevron-right" size={16} className="text-text-muted" />
        </button>
        {themeSettingsOpen && (
          <div className="space-y-3 rounded-xl border border-border-subtle bg-card-bg p-4">
            <div className="grid grid-cols-3 gap-2">
              {THEME_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => selectMode(mode)}
                  className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    currentThemeMode === mode
                      ? "bg-accent text-on-accent"
                      : "bg-bg text-text-muted hover:bg-bg-elevated hover:text-text-primary"
                  }`}
                >
                  {t(THEME_MODE_LABEL_KEYS[mode])}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {availablePalettes.map((palette) => (
                <button
                  key={palette.id}
                  type="button"
                  data-testid={`settings-theme-palette-${palette.id}`}
                  onClick={() => selectPalette(palette.id)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${
                    currentPaletteId === palette.id
                      ? "bg-bg ring-2 ring-accent"
                      : "bg-bg hover:bg-bg-elevated"
                  }`}
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: palette.preview.accent }}
                  />
                  <span className="text-text-primary">{palette.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={handleCycleNotificationSound}
          className="flex items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
        >
          <span className="flex items-center gap-3">
            <Icon name="bell" size={20} className="text-accent" />
            <span className="text-sm font-medium text-text-primary">
              {t("settings.notificationSound")}
            </span>
          </span>
          <span className="text-sm text-text-muted">{soundLabel}</span>
        </button>
        <button
          type="button"
          onClick={handleCycleLanguage}
          className="flex items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
        >
          <span className="flex items-center gap-3">
            <Icon name="alternate_email" size={20} className="text-accent" />
            <span className="text-sm font-medium text-text-primary">{t("settings.language")}</span>
          </span>
          <span className="text-sm text-text-muted">{currentLocaleName}</span>
        </button>
        <button
          type="button"
          onClick={toggleChatSortingSettings}
          className="flex items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
          aria-expanded={chatSortingSettingsOpen}
        >
          <span className="flex items-center gap-3">
            <Icon name="moreVert" size={20} className="text-accent" />
            <span className="text-sm font-medium text-text-primary">
              {t("settings.chatSorting")}
            </span>
          </span>
          <Icon name="chevron-right" size={16} className="text-text-muted" />
        </button>
        {chatSortingSettingsOpen && (
          <div className="space-y-2 rounded-xl border border-border-subtle bg-card-bg p-4">
            <button
              type="button"
              onClick={handleTogglePrioritizePersonalUnread}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                prioritizePersonalUnread
                  ? "bg-accent text-on-accent"
                  : "bg-bg text-text-primary hover:bg-bg-elevated"
              }`}
            >
              {t("settings.chatSortingPrioritizeDirects")}
            </button>
            <button
              type="button"
              onClick={handleTogglePrioritizeUnmutedUnreadChannels}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                prioritizeUnmutedUnreadChannels
                  ? "bg-accent text-on-accent"
                  : "bg-bg text-text-primary hover:bg-bg-elevated"
              }`}
            >
              {t("settings.chatSortingPrioritizeUnmuted")}
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={toggleFolderLayoutSettings}
          className="flex items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
          aria-expanded={folderLayoutSettingsOpen}
        >
          <span className="flex items-center gap-3">
            <Icon name="folders" size={20} className="text-accent" />
            <span className="text-sm font-medium text-text-primary">
              {t("settings.folderLayout")}
            </span>
          </span>
          <Icon name="chevron-right" size={16} className="text-text-muted" />
        </button>
        {folderLayoutSettingsOpen && (
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-border-subtle bg-card-bg p-4">
            {FOLDER_LAYOUTS.map((layout) => (
              <button
                key={layout}
                type="button"
                onClick={() => setFolderRailLayout(layout)}
                className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  folderRailLayout === layout
                    ? "bg-accent text-on-accent"
                    : "bg-bg text-text-primary hover:bg-bg-elevated"
                }`}
              >
                {t(FOLDER_LAYOUT_LABEL_KEYS[layout])}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4">
          <span className="flex items-center gap-3">
            <Icon name="grid" size={20} className="text-accent" />
            <span className="text-sm font-medium text-text-primary">
              {t("settings.appVersion")}
            </span>
          </span>
          <span className="text-sm text-text-muted">{APP_VERSION}</span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-2 flex items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
        >
          <span className="flex items-center gap-3">
            <Icon name="chevron-right" size={20} className="text-accent" />
            <span className="text-sm font-medium text-text-primary">{t("auth.logout")}</span>
          </span>
          <Icon name="chevron-right" size={16} className="text-text-muted" />
        </button>
      </section>
    </div>
  );
};
