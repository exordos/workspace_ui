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

export const RightPanelUserMenu: React.FC<RightPanelUserMenuProps> = ({
  heading,
  onOpenAboutDrawer,
  onOpenBuildsDrawer,
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
  const panelHeading = heading?.trim() ?? "";
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
    void navigate(withCurrentOrgRoute("/settings/personal-info"));
  }, [navigate]);

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
      {panelHeading.length > 0 && (
        <header className="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-4 py-4">
          <h2 className="text-base font-semibold text-text-primary">{panelHeading}</h2>
        </header>
      )}

      <ScrollArea className="flex-1 px-2 py-2">
        <div className="space-y-3">
          <section>
            <SectionLabel tone="muted" className="px-2.5 pb-1">
              {t("nav.profile")}
            </SectionLabel>
            <div className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle bg-card-bg">
              {currentWorkspaceSession != null && (
                <div
                  data-testid="user-menu-current-server-item"
                  className="flex items-center justify-between gap-3 px-2.5 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-bg">
                      {currentServerIconUrl != null ? (
                        <img
                          src={currentServerIconUrl}
                          alt=""
                          className="h-4 w-4 rounded object-contain"
                        />
                      ) : (
                        <Icon name="chatBubble" size={18} className="text-accent" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-text-primary">
                        {t("auth.currentServer")}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-text-muted">
                        {currentServerLabel}
                      </span>
                      <span className="truncate text-[11px] text-text-muted">
                        {currentServerAccountLabel}
                      </span>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={handleLogoutFromCurrentOrg}
                    className="hover:bg-notice-base/20 border-notice-base/40 bg-notice-base/10 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-notice-base transition-colors"
                    aria-label={t("auth.logoutFromOrg")}
                    title={t("auth.logoutFromOrg")}
                  >
                    <Icon name="logout" size={14} className="text-current" />
                  </button>
                </div>
              )}
              {currentWorkspaceSession != null && (
                <>
                  <RightPanelUserMenuMenuButton
                    label={t("connectExternalAccount.connectedAccounts")}
                    icon="links"
                    onClick={() => setExternalAccountsOpen((open) => !open)}
                    right={
                      <Icon
                        name={externalAccountsOpen ? "chevron-up" : "chevron-right"}
                        size={16}
                        className="text-text-muted"
                      />
                    }
                  />
                  {externalAccountsOpen && (
                    <div
                      className="mx-2 mb-2 rounded-md border border-border-subtle bg-bg-elevated px-2 py-2"
                      data-testid="user-menu-external-accounts"
                    >
                      <button
                        type="button"
                        onClick={() => setExternalAccountDialogOpen(true)}
                        className="border-accent/40 bg-accent/5 hover:bg-accent/10 mb-2 flex w-full items-center justify-between gap-3 rounded-lg border border-dashed px-2.5 py-2 text-left transition-colors"
                        aria-label={t("connectExternalAccount.connect")}
                        data-testid="connect-external-account-trigger"
                      >
                        <span className="min-w-0">
                          <span className="block text-xs font-medium text-text-primary">
                            {t("connectExternalAccount.connect")}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-text-muted">
                            {t("connectExternalAccount.connectHint")}
                          </span>
                        </span>
                        <Icon name="chevron-right" size={14} className="shrink-0 text-accent" />
                      </button>
                      <RightPanelExternalAccountsList />
                    </div>
                  )}
                </>
              )}
              <RightPanelUserMenuMenuButton
                label={t("settings.personalInfo")}
                icon="accountCircle"
                onClick={openPersonalInfo}
                right={<Icon name="chevron-right" size={16} className="text-text-muted" />}
              />
              <RightPanelUserMenuMenuButton
                label={t("settings.status")}
                icon="mood"
                subtitle={currentStatusSubtitle}
                onClick={openStatusDialog}
                disabled={currentWorkspaceSession == null}
                right={
                  currentWorkspaceSession == null ? null : (
                    <Icon name="chevron-right" size={16} className="text-text-muted" />
                  )
                }
              />
            </div>
          </section>

          <section>
            <SectionLabel tone="muted" className="px-2.5 pb-1">
              {t("settings.settings")}
            </SectionLabel>
            <div className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle bg-card-bg">
              <RightPanelUserMenuMenuButton
                label={t("settings.notificationSound")}
                icon="volumeUp"
                onClick={toggleSoundSettings}
                right={
                  <span className="flex items-center gap-1 text-xs text-text-muted">
                    {soundLabel}
                    <Icon
                      name={soundSettingsOpen ? "chevron-up" : "chevron-right"}
                      size={16}
                      className="text-current"
                    />
                  </span>
                }
              />
              {soundSettingsOpen && (
                <div className="mx-2 mb-2 divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle bg-bg-elevated">
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
                  <span className="flex items-center gap-1 text-xs text-text-muted">
                    {localeLabel}
                    <Icon
                      name={languageSettingsOpen ? "chevron-up" : "chevron-right"}
                      size={16}
                      className="text-current"
                    />
                  </span>
                }
              />
              {languageSettingsOpen && (
                <div className="mx-2 mb-2 divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle bg-bg-elevated">
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
                icon="visibility"
                subtitle={t("settings.authIdleTimeoutHint")}
                onClick={toggleAuthIdleTimeoutSettings}
                right={
                  <span className="flex items-center gap-1 text-xs text-text-muted">
                    {authIdleTimeoutLabel}
                    <Icon
                      name={authIdleTimeoutOpen ? "chevron-up" : "chevron-right"}
                      size={16}
                      className="text-current"
                    />
                  </span>
                }
              />
              {authIdleTimeoutOpen && (
                <div className="mx-2 mb-2 divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle bg-bg-elevated">
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
                icon="mood"
                onClick={() => setThemeSettingsOpen((open) => !open)}
                right={
                  <Icon
                    name={themeSettingsOpen ? "chevron-up" : "chevron-right"}
                    size={16}
                    className="text-text-muted"
                  />
                }
              />
              {themeSettingsOpen && (
                <div className="mx-2 mb-2 space-y-2 rounded-md border border-border-subtle bg-bg-elevated p-2">
                  <div className="divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle bg-card-bg">
                    {THEME_MODES.map((mode) => (
                      <RightPanelUserMenuOptionButton
                        key={mode}
                        label={t(MODE_LABEL_KEYS[mode])}
                        active={currentThemeMode === mode}
                        onClick={() => selectMode(mode)}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {availablePalettes.map((palette) => (
                      <button
                        key={palette.id}
                        type="button"
                        onClick={() => selectPalette(palette.id)}
                        className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors ${
                          currentPaletteId === palette.id
                            ? "border-accent bg-bg"
                            : "border-border-subtle bg-card-bg hover:bg-bg"
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

              {/*<RightPanelUserMenuMenuButton*/}
              {/*  label={t("settings.chatSorting")}*/}
              {/*  icon="channels"*/}
              {/*  onClick={() => setChatSortingOpen((open) => !open)}*/}
              {/*  subtitle={t("settings.chatSortingHint")}*/}
              {/*  right={*/}
              {/*    <Icon*/}
              {/*      name={chatSortingOpen ? "chevron-up" : "chevron-right"}*/}
              {/*      size={16}*/}
              {/*      className="text-text-muted"*/}
              {/*    />*/}
              {/*  }*/}
              {/*/>*/}
              {/*{chatSortingOpen && (*/}
              {/*  <div className="mx-2 mb-2 divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle bg-bg-elevated">*/}
              {/*    <RightPanelUserMenuOptionButton*/}
              {/*      label={t("settings.chatSortingPrioritizeDirects")}*/}
              {/*      active={prioritizePersonalUnread}*/}
              {/*      onClick={() => setPrioritizePersonalUnread(!prioritizePersonalUnread)}*/}
              {/*    />*/}
              {/*    <RightPanelUserMenuOptionButton*/}
              {/*      label={t("settings.chatSortingPrioritizeUnmuted")}*/}
              {/*      active={prioritizeUnmutedUnreadChannels}*/}
              {/*      onClick={() =>*/}
              {/*        setPrioritizeUnmutedUnreadChannels(!prioritizeUnmutedUnreadChannels)*/}
              {/*      }*/}
              {/*    />*/}
              {/*  </div>*/}
              {/*)}*/}

              <RightPanelUserMenuMenuButton
                label={t("settings.folderLayout")}
                icon="folders"
                onClick={() => setFolderLayoutOpen((open) => !open)}
                right={
                  <Icon
                    name={folderLayoutOpen ? "chevron-up" : "chevron-right"}
                    size={16}
                    className="text-text-muted"
                  />
                }
              />
              {folderLayoutOpen && (
                <div className="mx-2 mb-2 divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle bg-bg-elevated">
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
                icon="list_bulleted"
                onClick={() => setChatListDensityOpen((open) => !open)}
                right={
                  <Icon
                    name={chatListDensityOpen ? "chevron-up" : "chevron-right"}
                    size={16}
                    className="text-text-muted"
                  />
                }
              />
              {chatListDensityOpen && (
                <div className="mx-2 mb-2 divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle bg-bg-elevated">
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

          <section>
            <SectionLabel tone="muted" className="px-2.5 pb-1">
              {t("settings.appVersion")}
            </SectionLabel>
            <div className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle bg-card-bg">
              <RightPanelUserMenuMenuButton
                label={t("settings.selectBuild")}
                icon="grid"
                subtitle={t("settings.selectBuildHint")}
                onClick={openBuilds}
                right={<Icon name="chevron-right" size={16} className="text-text-muted" />}
              />
              <RightPanelUserMenuMenuButton
                label={t("settings.appVersion")}
                icon="info"
                onClick={openAbout}
                right={
                  <span className="flex items-center gap-2 text-xs text-text-muted">
                    <span>{APP_VERSION}</span>
                    <Icon name="chevron-right" size={16} className="text-current" />
                  </span>
                }
              />
              {IS_CONNECTION_DIAGNOSTICS_ENABLED && (
                <RightPanelUserMenuMenuButton
                  label={t("settings.connectionDiagnostics")}
                  icon="visibility"
                  onClick={openDiagnostics}
                  right={<Icon name="chevron-right" size={16} className="text-text-muted" />}
                />
              )}
              <RightPanelUserMenuMenuButton
                label={t("settings.clearCache")}
                icon="delete"
                subtitle={t("settings.clearCacheHint")}
                onClick={handleClearCache}
              />
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
