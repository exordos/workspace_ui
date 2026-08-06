import { Theme, type EmojiClickData } from "emoji-picker-react";
import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useThemeStore } from "~/entities/theme/theme.model";
import { selectUserStatusLabel } from "~/entities/user/user-selectors.lib";
import { updateWorkspaceOwnStatus } from "~/entities/user/user-workspace-status-actions.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { removeWorkspaceSession } from "~/entities/workspace-auth/workspace-auth.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { resolveWorkspacePostLogoutRoute } from "~/entities/workspace-auth/workspace-post-logout-route.lib";
import { ManageExternalProviderEntry } from "~/features/manage-external-provider/manage-external-provider-entry.ui";
import { AUTH_IDLE_TIMEOUT_PRESETS } from "~/features/settings/auth-idle-timeout.lib";
import { useSettingsStore } from "~/features/settings/settings.model";
import type { AuthIdleTimeout, NotificationSound } from "~/features/settings/settings.types";
import {
  getAvailablePalettes,
  selectMode,
  selectPalette,
} from "~/features/theme-picker/theme-picker.model";
import { useTranslation } from "~/i18n/i18n";
import { IS_CONNECTION_DIAGNOSTICS_ENABLED } from "~/shared/config/constants";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { performApplicationColdStart } from "~/shared/lib/local-reset";
import { createLogger } from "~/shared/lib/logger";
import { playNotificationSound } from "~/shared/lib/notification-sound";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { toast } from "~/shared/lib/toast/toast";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { SectionLabel } from "~/shared/ui/section-label.ui";
import {
  RightPanelConnectExternalAccountDialog,
  RightPanelExternalAccountsList,
} from "./right-panel-external-account.integration";
import {
  RightPanelUserMenuMenuButton,
  RightPanelUserMenuOptionButton,
} from "./right-panel-user-menu-buttons.ui";
import {
  APP_VERSION,
  AUTH_IDLE_TIMEOUT_LABEL_KEYS,
  CHAT_LIST_DENSITIES,
  CHAT_LIST_DENSITY_LABEL_KEYS,
  FOLDER_LAYOUTS,
  FOLDER_LAYOUT_LABEL_KEYS,
  getInstanceLabel,
  MODE_LABEL_KEYS,
  NOTIFICATION_SOUND_LABEL_KEYS,
  NOTIFICATION_SOUNDS,
  THEME_MODES,
} from "./right-panel-user-menu-constants.lib";
import { RightPanelUserMenuStatusDialog } from "./right-panel-user-menu-status-dialog.ui";
import type { UserStatusEmojiDisplay } from "./right-panel-user-menu-status-dialog.ui";
import type { RightPanelUserMenuProps } from "./right-panel-user-menu.types";

const log = createLogger("right-panel-user-menu");

/**
 * Flat section list — no card chrome (Figma right menu).
 * Edge-to-edge row hover needs RightDrawer `contentFlush` (nested -mx is clipped);
 * hairlines stay inset via ::before (px-4), not divide-y.
 */
const SECTION_LIST_CLASS =
  "[&>*+*]:relative [&>*+*]:before:pointer-events-none [&>*+*]:before:absolute [&>*+*]:before:inset-x-4 [&>*+*]:before:top-0 [&>*+*]:before:h-px [&>*+*]:before:bg-border-subtle";

/** Inline accordion panel when a settings row expands — same inset hairlines as the parent list. */
const ACCORDION_PANEL_CLASS =
  "mb-1 bg-bg-elevated/40 [&>*+*]:relative [&>*+*]:before:pointer-events-none [&>*+*]:before:absolute [&>*+*]:before:inset-x-4 [&>*+*]:before:top-0 [&>*+*]:before:h-px [&>*+*]:before:bg-border-subtle";

const MenuChevron: React.FC<{ open?: boolean }> = ({ open = false }) => (
  <Icon
    name={open ? "chevron-up" : "chevron-right"}
    size={16}
    className="shrink-0 text-text-secondary"
  />
);

export const RightPanelUserMenu: React.FC<RightPanelUserMenuProps> = ({
  onOpenAboutDrawer,
  onOpenBuildsDrawer,
  onOpenPersonalInfo,
}) => {
  const navigate = useNavigate();
  const rightDrawer = useRightDrawer();
  const { t, locale: currentLocale, supportedLocales: locales } = useTranslation();
  const currentWorkspaceSession = useWorkspaceAuthStore((s) => {
    const accountId = s.currentAccountId;
    return accountId != null
      ? s.sessions.find((session) => session.accountId === accountId)
      : undefined;
  });
  const getCurrentWorkspaceSession = useWorkspaceAuthStore((s) => s.getCurrentSession);
  const currentWorkspaceUser = useUsersStore((s) =>
    currentWorkspaceSession?.userUuid != null
      ? s.usersById[currentWorkspaceSession.userUuid]
      : undefined,
  );
  // const prioritizePersonalUnread = useSettingsStore((s) => s.prioritizePersonalUnread);
  // const prioritizeUnmutedUnreadChannels = useSettingsStore(
  //   (s) => s.prioritizeUnmutedUnreadChannels,
  // );
  // const setPrioritizePersonalUnread = useSettingsStore((s) => s.setPrioritizePersonalUnread);
  // const setPrioritizeUnmutedUnreadChannels = useSettingsStore(
  //   (s) => s.setPrioritizeUnmutedUnreadChannels,
  // );
  const notificationSound = useSettingsStore((s) => s.notificationSound);
  const setNotificationSound = useSettingsStore((s) => s.setNotificationSound);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const messengerSidebarSortMode = useSettingsStore((s) => s.messengerSidebarSortMode);
  const setMessengerSidebarSortMode = useSettingsStore((s) => s.setMessengerSidebarSortMode);
  const folderRailLayout = useSettingsStore((s) => s.folderRailLayout);
  const setFolderRailLayout = useSettingsStore((s) => s.setFolderRailLayout);
  const chatListDensity = useSettingsStore((s) => s.chatListDensity);
  const setChatListDensity = useSettingsStore((s) => s.setChatListDensity);
  const authIdleTimeout = useSettingsStore((s) => s.authIdleTimeout);
  const setAuthIdleTimeout = useSettingsStore((s) => s.setAuthIdleTimeout);
  const currentThemeMode = useThemeStore((s) => s.mode);
  const currentPaletteId = useThemeStore((s) => s.paletteId);
  const availablePalettes = useMemo(() => getAvailablePalettes(), []);
  const [soundSettingsOpen, setSoundSettingsOpen] = useState(false);
  const [languageSettingsOpen, setLanguageSettingsOpen] = useState(false);
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);
  const [messengerSidebarSortModeOpen, setMessengerSidebarSortModeOpen] = useState(false);
  // const [chatSortingOpen, setChatSortingOpen] = useState(false);
  const [folderLayoutOpen, setFolderLayoutOpen] = useState(false);
  const [chatListDensityOpen, setChatListDensityOpen] = useState(false);
  const [authIdleTimeoutOpen, setAuthIdleTimeoutOpen] = useState(false);
  const [externalAccountsOpen, setExternalAccountsOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusTextDraft, setStatusTextDraft] = useState("");
  const [statusAwayDraft, setStatusAwayDraft] = useState(false);
  const [statusEmojiDraft, setStatusEmojiDraft] = useState<string>("");
  const [statusEmojiPickerOpen, setStatusEmojiPickerOpen] = useState(false);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [externalAccountDialogOpen, setExternalAccountDialogOpen] = useState(false);
  const currentLocaleName =
    locales.find((supportedLocale) => supportedLocale.id === currentLocale)?.nativeLabel ??
    currentLocale;
  const currentServerLabel = useMemo(
    () =>
      currentWorkspaceSession != null
        ? getInstanceLabel(
            currentWorkspaceSession.organizationOrigin,
            currentWorkspaceSession.login,
          )
        : "",
    [currentWorkspaceSession],
  );
  const currentServerAccountLabel = currentWorkspaceSession?.login ?? "";
  const currentServerIconUrl = null;
  const currentStatusSubtitle =
    selectUserStatusLabel(currentWorkspaceUser) ??
    (currentWorkspaceUser?.status === "active"
      ? t("presence.online")
      : currentWorkspaceUser?.status === "idle" || currentWorkspaceUser?.status === "do_not_disturb"
        ? t("presence.away")
        : currentWorkspaceUser?.status === "offline"
          ? t("presence.offline")
          : t("settings.statusPlaceholder"));
  const selectedStatusEmojiDisplay = useMemo<UserStatusEmojiDisplay | null>(
    () => (statusEmojiDraft ? { kind: "text", text: statusEmojiDraft } : null),
    [statusEmojiDraft],
  );
  const statusEmojiPickerTheme = useMemo(
    () => (currentThemeMode === "light" ? Theme.LIGHT : Theme.DARK),
    [currentThemeMode],
  );

  const closeDrawer = useCallback(() => {
    rightDrawer?.setOpen(false);
  }, [rightDrawer]);

  const openStatusDialog = useCallback(() => {
    if (currentWorkspaceSession == null) return;
    setStatusTextDraft(currentWorkspaceUser?.statusText?.trim() ?? "");
    setStatusAwayDraft(
      currentWorkspaceUser?.status === "idle" || currentWorkspaceUser?.status === "do_not_disturb",
    );
    setStatusEmojiDraft(currentWorkspaceUser?.statusEmoji?.trim() ?? "");
    setStatusEmojiPickerOpen(false);
    setStatusDialogOpen(true);
  }, [
    currentWorkspaceSession,
    currentWorkspaceUser?.status,
    currentWorkspaceUser?.statusEmoji,
    currentWorkspaceUser?.statusText,
  ]);

  const closeStatusDialog = useCallback(() => {
    if (statusSubmitting) {
      return;
    }
    setStatusEmojiPickerOpen(false);
    setStatusDialogOpen(false);
  }, [statusSubmitting]);

  const clearStatusDraft = useCallback(() => {
    setStatusTextDraft("");
    setStatusAwayDraft(false);
    setStatusEmojiDraft("");
    setStatusEmojiPickerOpen(false);
  }, []);

  const toggleStatusEmojiPicker = useCallback(() => {
    setStatusEmojiPickerOpen((prevOpen) => !prevOpen);
  }, []);

  const handleSaveStatus = useCallback(async () => {
    if (currentWorkspaceSession == null) {
      toast.error(t("settings.statusUpdateError"));
      return;
    }
    setStatusSubmitting(true);
    try {
      const result = await updateWorkspaceOwnStatus({
        runtimeContext: currentWorkspaceSession,
        statusText: statusTextDraft,
        statusEmoji: statusEmojiDraft,
        away: statusAwayDraft,
      });
      if (!result.ok) {
        toast.error(t("settings.statusUpdateError"));
        return;
      }
      setStatusDialogOpen(false);
    } finally {
      setStatusSubmitting(false);
    }
  }, [currentWorkspaceSession, statusAwayDraft, statusEmojiDraft, statusTextDraft, t]);

  const openPersonalInfo = useCallback(() => {
    if (onOpenPersonalInfo != null) {
      onOpenPersonalInfo();
      return;
    }
  }, [onOpenPersonalInfo]);

  const openDiagnostics = useCallback(() => {
    void navigate(withCurrentOrgRoute("/settings/logs"));
  }, [navigate]);

  const openBuilds = useCallback(() => {
    if (onOpenBuildsDrawer != null) {
      onOpenBuildsDrawer();
      return;
    }
    void navigate(withCurrentOrgRoute("/settings/build"));
  }, [navigate, onOpenBuildsDrawer]);

  const openAbout = useCallback(() => {
    onOpenAboutDrawer?.();
  }, [onOpenAboutDrawer]);

  const handleSelectLanguage = useCallback(
    (nextLocale: (typeof locales)[number]["id"]) => {
      setLanguage(nextLocale);
    },
    [setLanguage],
  );

  const handleSelectNotificationSound = useCallback(
    (next: NotificationSound) => {
      setNotificationSound(next);
      if (next !== "none") {
        playNotificationSound(next);
      }
    },
    [setNotificationSound],
  );

  const handleSetNotificationSound = useCallback(
    (next: NotificationSound) => {
      handleSelectNotificationSound(next);
      setSoundSettingsOpen(false);
    },
    [handleSelectNotificationSound],
  );

  const handleSetLanguage = useCallback(
    (nextLocale: (typeof locales)[number]["id"]) => {
      handleSelectLanguage(nextLocale);
      setLanguageSettingsOpen(false);
    },
    [handleSelectLanguage],
  );

  const handleSetAuthIdleTimeout = useCallback(
    (next: AuthIdleTimeout) => {
      setAuthIdleTimeout(next);
      setAuthIdleTimeoutOpen(false);
    },
    [setAuthIdleTimeout],
  );

  const soundLabel = useMemo(
    () => t(NOTIFICATION_SOUND_LABEL_KEYS[notificationSound]),
    [notificationSound, t],
  );
  const authIdleTimeoutLabel = useMemo(
    () => t(AUTH_IDLE_TIMEOUT_LABEL_KEYS[authIdleTimeout]),
    [authIdleTimeout, t],
  );

  const currentLocaleOption = useMemo(
    () => locales.find((supportedLocale) => supportedLocale.id === currentLocale),
    [currentLocale, locales],
  );
  const localeLabel = currentLocaleOption?.nativeLabel ?? currentLocaleName;

  const toggleSoundSettings = useCallback(() => {
    setSoundSettingsOpen((open) => !open);
  }, []);
  const toggleLanguageSettings = useCallback(() => {
    setLanguageSettingsOpen((open) => !open);
  }, []);
  const toggleMessengerSidebarSortMode = useCallback(() => {
    setMessengerSidebarSortModeOpen((open) => !open);
  }, []);
  const toggleAuthIdleTimeoutSettings = useCallback(() => {
    setAuthIdleTimeoutOpen((open) => !open);
  }, []);

  const handleClearCache = useCallback(async () => {
    const confirmed = window.confirm(t("settings.clearCacheConfirm"));
    if (!confirmed) return;

    log.info("Clearing application cache from unified account/settings sidebar");
    try {
      await performApplicationColdStart();
    } catch (err) {
      log.warn("Application cold-start reset failed", { error: String(err) });
    }
    window.location.reload();
  }, [t]);

  const handleLogoutFromCurrentOrg = useCallback(async () => {
    if (currentWorkspaceSession == null) return;
    const confirmed = window.confirm(
      t("auth.logoutFromOrgConfirm", { server: currentServerLabel }),
    );
    if (!confirmed) return;
    await removeWorkspaceSession(currentWorkspaceSession.accountId);
    void navigate(resolveWorkspacePostLogoutRoute(getCurrentWorkspaceSession()), { replace: true });
    closeDrawer();
  }, [
    closeDrawer,
    currentServerLabel,
    currentWorkspaceSession,
    getCurrentWorkspaceSession,
    navigate,
    t,
  ]);

  const handleStatusEmojiPick = useCallback((data: EmojiClickData) => {
    const emoji = data.emoji.trim();
    if (emoji.length === 0) {
      log.warn("Status emoji picker returned an empty emoji");
      return;
    }
    setStatusEmojiDraft(emoji.slice(0, 64));
    setStatusEmojiPickerOpen(false);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary">
      {/* Shell contentFlush cancels drawer px-2; rows own px-4 so hover reaches panel edges. */}
      <ScrollArea className="flex-1 py-5">
        <div className="space-y-5">
          <section className="space-y-3">
            <SectionLabel tone="muted" className="px-4">
              {t("settings.sectionDescription")}
            </SectionLabel>
            <div className={SECTION_LIST_CLASS}>
              {currentWorkspaceSession != null && (
                <div
                  data-testid="user-menu-current-server-item"
                  className="flex w-full items-center justify-between gap-2 px-4 py-1.5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center text-text-secondary">
                      {currentServerIconUrl != null ? (
                        <img
                          src={currentServerIconUrl}
                          alt=""
                          className="h-5 w-5 rounded object-contain"
                        />
                      ) : (
                        <Icon name="dashboard_customize" size={22} className="text-current" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium leading-5 text-text-primary">
                        {t("auth.currentServer")}
                      </span>
                      <span className="mt-0.5 block truncate text-sm leading-5 text-text-muted">
                        {currentServerLabel}
                      </span>
                      <span className="block truncate text-sm leading-5 text-text-muted">
                        {currentServerAccountLabel}
                      </span>
                    </span>
                  </span>
                </div>
              )}
              {currentWorkspaceSession != null && (
                <>
                  <RightPanelUserMenuMenuButton
                    label={t("externalAccounts.title")}
                    // Same chain as `links`; compact viewBox so weight matches sibling menu icons
                    icon="links_compact"
                    onClick={() => setExternalAccountsOpen((open) => !open)}
                    right={<MenuChevron open={externalAccountsOpen} />}
                  />
                  {externalAccountsOpen && (
                    <div className="space-y-3 px-4 py-3" data-testid="user-menu-external-accounts">
                      {/* Connected accounts (or empty/loading) sit above the CTA */}
                      <RightPanelExternalAccountsList />

                      {/* Primary action: accent CTA, not a menu row — no chevron */}
                      <div className="space-y-1.5">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          className="w-full gap-1.5"
                          onClick={() => setExternalAccountDialogOpen(true)}
                          aria-label={t("connectExternalAccount.connect")}
                          data-testid="connect-external-account-trigger"
                        >
                          <Icon name="add" size={16} className="shrink-0 text-current" />
                          <span>{t("connectExternalAccount.connect")}</span>
                        </Button>
                        <p className="px-1 text-center text-[11px] leading-4 text-text-muted">
                          {t("connectExternalAccount.connectHint")}
                        </p>
                      </div>

                      <ManageExternalProviderEntry runtimeContext={currentWorkspaceSession} />
                    </div>
                  )}
                </>
              )}
              <RightPanelUserMenuMenuButton
                label={t("settings.personalInfo")}
                icon="accountCircle"
                onClick={openPersonalInfo}
                right={<MenuChevron />}
              />
              <RightPanelUserMenuMenuButton
                label={t("settings.status")}
                icon="sentiment_satisfied"
                subtitle={currentStatusSubtitle}
                onClick={openStatusDialog}
                disabled={currentWorkspaceSession == null}
              />
            </div>
          </section>

          <section className="space-y-3">
            <SectionLabel tone="muted" className="px-4">
              {t("settings.settings")}
            </SectionLabel>
            <div className={SECTION_LIST_CLASS}>
              <RightPanelUserMenuMenuButton
                label={t("settings.notificationSound")}
                icon="volumeUp"
                onClick={toggleSoundSettings}
                right={
                  <span className="flex items-center gap-2 text-sm text-text-secondary">
                    {soundLabel}
                    <MenuChevron open={soundSettingsOpen} />
                  </span>
                }
              />
              {soundSettingsOpen && (
                <div className={ACCORDION_PANEL_CLASS}>
                  {NOTIFICATION_SOUNDS.map((sound) => (
                    <RightPanelUserMenuOptionButton
                      key={sound}
                      label={t(NOTIFICATION_SOUND_LABEL_KEYS[sound])}
                      active={notificationSound === sound}
                      onClick={() => handleSetNotificationSound(sound)}
                    />
                  ))}
                </div>
              )}
              <RightPanelUserMenuMenuButton
                label={t("settings.language")}
                icon="language"
                onClick={toggleLanguageSettings}
                right={
                  <span className="flex items-center gap-2 text-sm text-text-secondary">
                    {localeLabel}
                    <MenuChevron open={languageSettingsOpen} />
                  </span>
                }
              />
              {languageSettingsOpen && (
                <div className={ACCORDION_PANEL_CLASS}>
                  {locales.map((localeOption) => (
                    <RightPanelUserMenuOptionButton
                      key={localeOption.id}
                      label={localeOption.nativeLabel}
                      active={currentLocale === localeOption.id}
                      onClick={() => handleSetLanguage(localeOption.id)}
                    />
                  ))}
                </div>
              )}

              <RightPanelUserMenuMenuButton
                label={t("settings.authIdleTimeout")}
                icon="delete_history"
                subtitle={t("settings.authIdleTimeoutHint")}
                onClick={toggleAuthIdleTimeoutSettings}
                right={
                  <span className="flex items-center gap-2 text-sm text-text-secondary">
                    {authIdleTimeoutLabel}
                    <MenuChevron open={authIdleTimeoutOpen} />
                  </span>
                }
              />
              {authIdleTimeoutOpen && (
                <div className={ACCORDION_PANEL_CLASS}>
                  {AUTH_IDLE_TIMEOUT_PRESETS.map((timeout) => (
                    <RightPanelUserMenuOptionButton
                      key={timeout}
                      label={t(AUTH_IDLE_TIMEOUT_LABEL_KEYS[timeout])}
                      active={authIdleTimeout === timeout}
                      onClick={() => handleSetAuthIdleTimeout(timeout)}
                    />
                  ))}
                </div>
              )}

              <RightPanelUserMenuMenuButton
                label={t("settings.themeSettings")}
                icon="draw"
                onClick={() => setThemeSettingsOpen((open) => !open)}
                right={<MenuChevron open={themeSettingsOpen} />}
              />
              {themeSettingsOpen && (
                <div className="bg-bg-elevated/40 mb-1 space-y-2 py-2">
                  <div className={ACCORDION_PANEL_CLASS}>
                    {THEME_MODES.map((mode) => (
                      <RightPanelUserMenuOptionButton
                        key={mode}
                        label={t(MODE_LABEL_KEYS[mode])}
                        active={currentThemeMode === mode}
                        onClick={() => selectMode(mode)}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 px-4">
                    {availablePalettes.map((palette) => (
                      <button
                        key={palette.id}
                        type="button"
                        onClick={() => selectPalette(palette.id)}
                        className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-xs transition-colors ${
                          currentPaletteId === palette.id
                            ? "bg-card-bg-active ring-1 ring-accent"
                            : "bg-bg hover:bg-card-bg-active"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: palette.preview.accent }}
                          />
                          <span className="truncate text-text-primary">{palette.name}</span>
                        </span>
                        {currentPaletteId === palette.id ? (
                          <Icon name="check" size={12} className="text-accent" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <RightPanelUserMenuMenuButton
                label={t("settings.messengerSidebarSortMode")}
                icon="sort"
                onClick={toggleMessengerSidebarSortMode}
                right={<MenuChevron open={messengerSidebarSortModeOpen} />}
              />
              {messengerSidebarSortModeOpen && (
                <div className={ACCORDION_PANEL_CLASS}>
                  <RightPanelUserMenuOptionButton
                    label={t("settings.messengerSidebarSortModeLastMessage")}
                    active={messengerSidebarSortMode === "last_message"}
                    onClick={() => setMessengerSidebarSortMode("last_message")}
                  />
                  <RightPanelUserMenuOptionButton
                    label={t("settings.messengerSidebarSortModeUnreadFirst")}
                    active={messengerSidebarSortMode === "unread_first"}
                    onClick={() => setMessengerSidebarSortMode("unread_first")}
                  />
                </div>
              )}

              <RightPanelUserMenuMenuButton
                label={t("settings.folderLayout")}
                icon="folder_copy"
                onClick={() => setFolderLayoutOpen((open) => !open)}
                right={<MenuChevron open={folderLayoutOpen} />}
              />
              {folderLayoutOpen && (
                <div className={ACCORDION_PANEL_CLASS}>
                  {FOLDER_LAYOUTS.map((layout) => (
                    <RightPanelUserMenuOptionButton
                      key={layout}
                      label={t(FOLDER_LAYOUT_LABEL_KEYS[layout])}
                      active={folderRailLayout === layout}
                      onClick={() => setFolderRailLayout(layout)}
                    />
                  ))}
                </div>
              )}

              <RightPanelUserMenuMenuButton
                label={t("settings.chatListDensity")}
                icon="lists"
                onClick={() => setChatListDensityOpen((open) => !open)}
                right={<MenuChevron open={chatListDensityOpen} />}
              />
              {chatListDensityOpen && (
                <div className={ACCORDION_PANEL_CLASS}>
                  {CHAT_LIST_DENSITIES.map((density) => (
                    <RightPanelUserMenuOptionButton
                      key={density}
                      label={t(CHAT_LIST_DENSITY_LABEL_KEYS[density])}
                      active={chatListDensity === density}
                      onClick={() => setChatListDensity(density)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <SectionLabel tone="muted" className="px-4">
              {t("settings.appVersion")}
            </SectionLabel>
            <div className={SECTION_LIST_CLASS}>
              <RightPanelUserMenuMenuButton
                label={t("settings.selectBuild")}
                icon="build"
                subtitle={t("settings.selectBuildHint")}
                onClick={openBuilds}
                right={<MenuChevron />}
              />
              <RightPanelUserMenuMenuButton
                label={t("settings.appVersion")}
                icon="info"
                onClick={openAbout}
                right={
                  <span className="flex items-center gap-2 text-sm text-text-secondary">
                    <span>{APP_VERSION}</span>
                    <MenuChevron />
                  </span>
                }
              />
              {IS_CONNECTION_DIAGNOSTICS_ENABLED && (
                <RightPanelUserMenuMenuButton
                  label={t("settings.connectionDiagnostics")}
                  icon="lab_profile"
                  onClick={openDiagnostics}
                  right={<MenuChevron />}
                />
              )}
              <RightPanelUserMenuMenuButton
                label={t("settings.clearCache")}
                icon="delete"
                subtitle={t("settings.clearCacheHint")}
                onClick={handleClearCache}
                right={<MenuChevron />}
              />
              {currentWorkspaceSession != null && (
                <RightPanelUserMenuMenuButton
                  label={t("auth.logout")}
                  // Same glyph as `logout`; compact crop matches sibling menu optical size
                  icon="logout_compact"
                  tone="danger"
                  onClick={handleLogoutFromCurrentOrg}
                  testId="user-menu-logout-button"
                  ariaLabel={t("auth.logoutFromOrg")}
                />
              )}
            </div>
          </section>
        </div>
      </ScrollArea>

      <RightPanelUserMenuStatusDialog
        open={statusDialogOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setStatusDialogOpen(true);
            return;
          }
          closeStatusDialog();
        }}
        closeStatusDialog={closeStatusDialog}
        statusEmojiPickerOpen={statusEmojiPickerOpen}
        onStatusEmojiPickerToggle={toggleStatusEmojiPicker}
        setStatusEmojiPickerOpen={setStatusEmojiPickerOpen}
        statusEmojiDraft={statusEmojiDraft}
        setStatusEmojiDraft={setStatusEmojiDraft}
        statusTextDraft={statusTextDraft}
        setStatusTextDraft={setStatusTextDraft}
        statusAwayDraft={statusAwayDraft}
        setStatusAwayDraft={setStatusAwayDraft}
        statusSubmitting={statusSubmitting}
        selectedStatusEmojiDisplay={selectedStatusEmojiDisplay}
        statusEmojiPickerTheme={statusEmojiPickerTheme}
        t={t}
        handleStatusEmojiPick={handleStatusEmojiPick}
        clearStatusDraft={clearStatusDraft}
        handleSaveStatus={handleSaveStatus}
      />
      <RightPanelConnectExternalAccountDialog
        open={externalAccountDialogOpen}
        onOpenChange={setExternalAccountDialogOpen}
      />
    </div>
  );
};
