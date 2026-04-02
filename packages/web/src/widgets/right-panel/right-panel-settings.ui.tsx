import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useThemeStore } from "~/entities/theme/theme.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { getAvailablePalettes } from "~/features/theme-picker/theme-picker.model";
import { useTranslation } from "~/i18n/i18n";
import { IS_CONNECTION_DIAGNOSTICS_ENABLED } from "~/shared/config/constants";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { wipeCredentials } from "~/shared/lib/auth-guard";
import { createLogger } from "~/shared/lib/logger";
import { playNotificationSound } from "~/shared/lib/notification-sound";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { pushService } from "~/shared/lib/push/push.service";
import { Icon } from "~/shared/ui/icon";
import { ScrollArea } from "~/shared/ui/scroll-area";
import {
  NOTIFICATION_SOUND_LABEL_KEYS,
  NOTIFICATION_SOUNDS,
} from "./right-panel-settings-constants.lib";
import {
  RightPanelChatSortingPanel,
  RightPanelFolderLayoutPanel,
  RightPanelThemeSettingsPanel,
} from "./right-panel-settings-panels.ui";

const log = createLogger("right-panel-settings");
const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "dev";

export const RightPanelSettings: React.FC = () => {
  const navigate = useNavigate();
  const rightDrawer = useRightDrawer();
  const { t, locale: currentLocale, setLocale, supportedLocales: locales } = useTranslation();
  const currentUserId = useChatListStore((s) => s.currentUserId);
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
  const availablePalettes = useMemo(() => getAvailablePalettes(), []);
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);
  const [chatSortingSettingsOpen, setChatSortingSettingsOpen] = useState(false);
  const [folderLayoutSettingsOpen, setFolderLayoutSettingsOpen] = useState(false);

  const openPersonalInfo = useCallback(() => {
    if (currentUserId != null && rightDrawer?.openUserProfile != null) {
      rightDrawer.openUserProfile(currentUserId);
      return;
    }
    void navigate(withCurrentOrgRoute("/settings/personal-info"));
  }, [currentUserId, navigate, rightDrawer]);
  const openLogs = useCallback(() => {
    void navigate(withCurrentOrgRoute("/settings/logs"));
  }, [navigate]);
  const openBuilds = useCallback(() => {
    void navigate(withCurrentOrgRoute("/settings/build"));
  }, [navigate]);
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
    log.info("User initiated logout from right drawer settings panel");
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary">
      <header className="flex-shrink-0 border-b border-border-subtle px-4 pb-3 pt-0">
        <h2 className="text-sm font-semibold text-text-primary">{t("settings.settings")}</h2>
      </header>
      <ScrollArea className="flex-1 px-4 py-3">
        <div className="space-y-3">
          <button
            type="button"
            onClick={openPersonalInfo}
            className="flex w-full items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
          >
            <span className="flex items-center gap-3">
              <Icon name="accountCircle" size={20} className="text-accent" />
              <span className="text-sm font-medium text-text-primary">
                {t("settings.personalInfo")}
              </span>
            </span>
            <Icon name="chevron-right" size={16} className="text-text-muted" />
          </button>
          {IS_CONNECTION_DIAGNOSTICS_ENABLED && (
            <button
              type="button"
              onClick={openLogs}
              className="flex w-full items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
            >
              <span className="flex items-center gap-3">
                <Icon name="visibility" size={20} className="text-accent" />
                <span className="text-sm font-medium text-text-primary">
                  {t("settings.connectionDiagnostics")}
                </span>
              </span>
              <Icon name="chevron-right" size={16} className="text-text-muted" />
            </button>
          )}
          <button
            type="button"
            onClick={openBuilds}
            className="flex w-full items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
          >
            <span className="flex items-center gap-3">
              <Icon name="grid" size={20} className="text-accent" />
              <span className="text-sm font-medium text-text-primary">
                {t("settings.selectBuild")}
              </span>
            </span>
            <Icon name="chevron-right" size={16} className="text-text-muted" />
          </button>
          <button
            type="button"
            onClick={toggleThemeSettings}
            className="flex w-full items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
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
            <RightPanelThemeSettingsPanel
              currentThemeMode={currentThemeMode}
              currentPaletteId={currentPaletteId}
              availablePalettes={availablePalettes}
            />
          )}
          <button
            type="button"
            onClick={handleCycleNotificationSound}
            className="flex w-full items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
          >
            <span className="flex items-center gap-3">
              <Icon name="volumeUp" size={20} className="text-accent" />
              <span className="text-sm font-medium text-text-primary">
                {t("settings.notificationSound")}
              </span>
            </span>
            <span className="text-sm text-text-muted">{soundLabel}</span>
          </button>
          <button
            type="button"
            onClick={handleCycleLanguage}
            className="flex w-full items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
          >
            <span className="flex items-center gap-3">
              <Icon name="language" size={20} className="text-accent" />
              <span className="text-sm font-medium text-text-primary">
                {t("settings.language")}
              </span>
            </span>
            <span className="text-sm text-text-muted">{currentLocaleName}</span>
          </button>
          <button
            type="button"
            onClick={toggleChatSortingSettings}
            className="flex w-full items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
            aria-expanded={chatSortingSettingsOpen}
          >
            <span className="flex items-center gap-3">
              <Icon name="channels" size={20} className="text-accent" />
              <span className="text-sm font-medium text-text-primary">
                {t("settings.chatSorting")}
              </span>
            </span>
            <Icon name="chevron-right" size={16} className="text-text-muted" />
          </button>
          {chatSortingSettingsOpen && (
            <RightPanelChatSortingPanel
              prioritizePersonalUnread={prioritizePersonalUnread}
              prioritizeUnmutedUnreadChannels={prioritizeUnmutedUnreadChannels}
              onTogglePrioritizePersonalUnread={handleTogglePrioritizePersonalUnread}
              onTogglePrioritizeUnmutedUnreadChannels={handleTogglePrioritizeUnmutedUnreadChannels}
            />
          )}
          <button
            type="button"
            onClick={toggleFolderLayoutSettings}
            className="flex w-full items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
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
            <RightPanelFolderLayoutPanel
              folderRailLayout={folderRailLayout}
              setFolderRailLayout={setFolderRailLayout}
            />
          )}
          <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4">
            <span className="flex items-center gap-3">
              <Icon name="info" size={20} className="text-accent" />
              <span className="text-sm font-medium text-text-primary">
                {t("settings.appVersion")}
              </span>
            </span>
            <span className="text-sm text-text-muted">{APP_VERSION}</span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-between rounded-xl border border-border-subtle bg-card-bg p-4 text-left transition-colors hover:bg-bg-elevated"
          >
            <span className="flex items-center gap-3">
              <Icon name="logout" size={20} className="text-accent" />
              <span className="text-sm font-medium text-text-primary">{t("auth.logout")}</span>
            </span>
            <Icon name="chevron-right" size={16} className="text-text-muted" />
          </button>
        </div>
      </ScrollArea>
    </div>
  );
};
