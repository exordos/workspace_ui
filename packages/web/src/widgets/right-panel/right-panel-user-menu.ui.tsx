import { Theme, type EmojiClickData } from "emoji-picker-react";
import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useThemeStore } from "~/entities/theme/theme.model";
import { updateOwnStatus } from "~/entities/user/api/user.api";
import { useUserStatus } from "~/entities/user/user-status.hooks";
import {
  encodeEmojiToCode,
  formatUserStatusLabel,
  getUserStatusEmoji,
  normalizeStatusEmojiName,
} from "~/entities/user/user-status.lib";
import { useUsersStore } from "~/entities/user/user.model";
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
import { resolveUnicodeToCanonicalShortcode } from "~/shared/lib/emoji-shortcodes.lib";
import { clearLocalStatePreservingCriticalKeys } from "~/shared/lib/local-reset";
import { createLogger } from "~/shared/lib/logger";
import { playNotificationSound } from "~/shared/lib/notification-sound";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { resolveOrganizationLogoUrl } from "~/shared/lib/organization-branding";
import { ensureRealmEmojisLoaded, getCachedRealmEmojis } from "~/shared/lib/realm-emojis-cache";
import { Icon } from "~/shared/ui/icon";
import { ScrollArea } from "~/shared/ui/scroll-area";
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
import type { RightPanelUserMenuProps } from "./right-panel-user-menu.types";

const log = createLogger("right-panel-user-menu");

export const RightPanelUserMenu: React.FC<RightPanelUserMenuProps> = ({
  heading,
  onOpenAboutDrawer,
  onOpenBuildsDrawer,
}) => {
  const navigate = useNavigate();
  const rightDrawer = useRightDrawer();
  const { t, locale: currentLocale, setLocale, supportedLocales: locales } = useTranslation();
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const currentUser = useUsersStore((s) =>
    currentUserId != null ? s.getUser(currentUserId) : null,
  );
  const instances = useInstancesStore((s) => s.instances);
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);
  const removeInstance = useInstancesStore((s) => s.removeInstance);
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
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusTextDraft, setStatusTextDraft] = useState("");
  const [statusAwayDraft, setStatusAwayDraft] = useState(false);
  const [statusEmojiNameDraft, setStatusEmojiNameDraft] = useState<string>("");
  const [statusEmojiCodeDraft, setStatusEmojiCodeDraft] = useState<string>("");
  const [statusEmojiPickerOpen, setStatusEmojiPickerOpen] = useState(false);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [customEmojis, setCustomEmojis] = useState(() => getCachedRealmEmojis());
  const panelHeading = heading?.trim() ?? "";
  const currentLocaleName =
    locales.find((supportedLocale) => supportedLocale.id === currentLocale)?.nativeLabel ??
    currentLocale;
  const currentInstance = useMemo(
    () => instances.find((instance) => instance.id === currentInstanceId) ?? null,
    [instances, currentInstanceId],
  );
  const currentServerLabel = useMemo(
    () => (currentInstance ? getInstanceLabel(currentInstance.realm, currentInstance.email) : ""),
    [currentInstance],
  );
  const currentServerIconUrl = useMemo(
    () => resolveOrganizationLogoUrl(currentInstance?.realmIcon, currentInstance?.realm),
    [currentInstance?.realmIcon, currentInstance?.realm],
  );
  const currentStatus = useUserStatus(currentUserId);
  const currentStatusLabel = useMemo(
    () => currentStatus.statusLabel ?? formatUserStatusLabel(currentUser?.status),
    [currentStatus.statusLabel, currentUser?.status],
  );
  const selectedStatusEmoji = useMemo(
    () =>
      getUserStatusEmoji({
        text: "",
        emojiName: statusEmojiNameDraft || undefined,
        emojiCode: statusEmojiCodeDraft || undefined,
        away: false,
      }),
    [statusEmojiCodeDraft, statusEmojiNameDraft],
  );
  const statusEmojiPickerTheme = useMemo(
    () => (currentThemeMode === "light" ? Theme.LIGHT : Theme.DARK),
    [currentThemeMode],
  );

  const ensureCustomEmojisLoaded = useCallback(() => {
    void ensureRealmEmojisLoaded()
      .then((list) => {
        setCustomEmojis(list);
      })
      .catch(() => {
        log.warn("Failed to load realm custom emojis for status picker");
      });
  }, []);

  const closeDrawer = useCallback(() => {
    rightDrawer?.setOpen(false);
  }, [rightDrawer]);

  const openStatusDialog = useCallback(() => {
    const status = currentUser?.status;
    setStatusTextDraft(status?.text ?? "");
    setStatusAwayDraft(status?.away ?? false);
    setStatusEmojiNameDraft(status?.emojiName ?? "");
    setStatusEmojiCodeDraft(status?.emojiCode ?? "");
    setStatusEmojiPickerOpen(false);
    setStatusDialogOpen(true);
  }, [currentUser?.status]);

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
    setStatusEmojiNameDraft("");
    setStatusEmojiCodeDraft("");
    setStatusEmojiPickerOpen(false);
  }, []);

  const toggleStatusEmojiPicker = useCallback(() => {
    setStatusEmojiPickerOpen((prevOpen) => {
      const nextOpen = !prevOpen;
      if (nextOpen) {
        ensureCustomEmojisLoaded();
      }
      return nextOpen;
    });
  }, [ensureCustomEmojisLoaded]);

  const handleSaveStatus = useCallback(async () => {
    if (currentUserId == null) {
      return;
    }
    setStatusSubmitting(true);
    try {
      const nextStatus = await updateOwnStatus({
        text: statusTextDraft,
        emojiName: statusEmojiNameDraft || undefined,
        away: statusAwayDraft,
      });
      const isClearRequest =
        statusTextDraft.trim().length === 0 &&
        statusEmojiNameDraft.trim().length === 0 &&
        statusAwayDraft === false;
      if (nextStatus == null && !isClearRequest) {
        log.warn("Status update returned empty payload for non-empty draft", {
          hasText: statusTextDraft.trim().length > 0,
          hasEmoji: statusEmojiNameDraft.trim().length > 0,
          away: statusAwayDraft,
        });
        return;
      }
      useUsersStore.getState().setStatus(currentUserId, nextStatus, Date.now());
      setStatusDialogOpen(false);
    } finally {
      setStatusSubmitting(false);
    }
  }, [currentUserId, statusAwayDraft, statusEmojiNameDraft, statusTextDraft]);

  const openPersonalInfo = useCallback(() => {
    if (currentUserId != null && rightDrawer?.openUserProfile != null) {
      rightDrawer.openUserProfile(currentUserId);
      return;
    }
    void navigate(withCurrentOrgRoute("/settings/personal-info"));
  }, [currentUserId, navigate, rightDrawer]);

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
      setLocale(nextLocale);
      setLanguage(nextLocale);
    },
    [setLanguage, setLocale],
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

  const handleClearCache = useCallback(() => {
    log.info("Clearing application cache from unified account/settings sidebar");
    clearLocalStatePreservingCriticalKeys();
    window.location.reload();
  }, []);

  const handleLogoutFromCurrentOrg = useCallback(() => {
    if (currentInstance == null) return;
    const confirmed = window.confirm(
      t("auth.logoutFromOrgConfirm", { server: currentServerLabel }),
    );
    if (!confirmed) return;
    removeInstance(currentInstance.id);
    closeDrawer();
  }, [closeDrawer, currentInstance, currentServerLabel, removeInstance, t]);

  const handleStatusEmojiPick = useCallback((data: EmojiClickData) => {
    const normalizedPickerName = normalizeStatusEmojiName(data.names?.[0] ?? "");
    if (data.isCustom) {
      if (!normalizedPickerName) {
        return;
      }
      setStatusEmojiNameDraft(normalizedPickerName);
      setStatusEmojiCodeDraft("");
      setStatusEmojiPickerOpen(false);
      return;
    }
    const emojiCode = (
      data.unifiedWithoutSkinTone ||
      data.unified ||
      encodeEmojiToCode(data.emoji ?? "")
    )
      .trim()
      .toLowerCase();
    if (!emojiCode) {
      return;
    }
    const emojiName = resolveUnicodeToCanonicalShortcode(emojiCode) ?? normalizedPickerName;
    if (!emojiName) {
      return;
    }
    setStatusEmojiNameDraft(emojiName);
    setStatusEmojiCodeDraft(emojiCode);
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
            <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              {t("nav.profile")}
            </p>
            <div className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle bg-card-bg">
              {currentInstance != null && (
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
                        {currentInstance.email}
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
              <RightPanelUserMenuMenuButton
                label={t("settings.personalInfo")}
                icon="accountCircle"
                onClick={openPersonalInfo}
                right={<Icon name="chevron-right" size={16} className="text-text-muted" />}
              />
              <RightPanelUserMenuMenuButton
                label={t("settings.status")}
                icon="mood"
                subtitle={currentStatusLabel ?? t("settings.statusPlaceholder")}
                onClick={openStatusDialog}
                right={<Icon name="chevron-right" size={16} className="text-text-muted" />}
              />
            </div>
          </section>

          <section>
            <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              {t("settings.settings")}
            </p>
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
            <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              {t("settings.appVersion")}
            </p>
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
        statusEmojiNameDraft={statusEmojiNameDraft}
        setStatusEmojiNameDraft={setStatusEmojiNameDraft}
        statusEmojiCodeDraft={statusEmojiCodeDraft}
        setStatusEmojiCodeDraft={setStatusEmojiCodeDraft}
        statusTextDraft={statusTextDraft}
        setStatusTextDraft={setStatusTextDraft}
        statusAwayDraft={statusAwayDraft}
        setStatusAwayDraft={setStatusAwayDraft}
        statusSubmitting={statusSubmitting}
        selectedStatusEmoji={selectedStatusEmoji}
        statusEmojiPickerTheme={statusEmojiPickerTheme}
        customEmojis={customEmojis}
        t={t}
        handleStatusEmojiPick={handleStatusEmojiPick}
        clearStatusDraft={clearStatusDraft}
        handleSaveStatus={handleSaveStatus}
      />
    </div>
  );
};
