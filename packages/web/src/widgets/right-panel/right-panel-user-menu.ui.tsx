import * as Dialog from "@radix-ui/react-dialog";
import EmojiPicker, { Theme, type EmojiClickData } from "emoji-picker-react";
import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useThemeStore } from "~/entities/theme/theme.model";
import {
  encodeEmojiToCode,
  formatUserStatusLabel,
  getUserStatusEmoji,
  normalizeStatusEmojiName,
} from "~/entities/user/user-status.lib";
import { updateOwnStatus } from "~/entities/user/api/user.api";
import { useUserStatus } from "~/entities/user/user-status.hooks";
import { useUsersStore } from "~/entities/user/user.model";
import {
  type ChatListDensity,
  type FolderRailLayout,
  type NotificationSound,
} from "~/features/settings/settings.types";
import { useSettingsStore } from "~/features/settings/settings.model";
import { getAvailablePalettes, selectMode, selectPalette } from "~/features/theme-picker/theme-picker.model";
import { useTranslation } from "~/i18n/i18n";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { clearLocalStatePreservingCriticalKeys } from "~/shared/lib/local-reset";
import { createLogger } from "~/shared/lib/logger";
import { playNotificationSound } from "~/shared/lib/notification-sound";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import type { ThemeMode } from "~/shared/lib/themes/tokens";
import { isValidUrl } from "~/shared/lib/validation";
import { Icon, type IconName } from "~/shared/ui/icon";
import { ScrollArea } from "~/shared/ui/scroll-area";

const log = createLogger("right-panel-user-menu");
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
const MODE_LABEL_KEYS: Record<ThemeMode, string> = {
  light: "settings.themeLight",
  dark: "settings.themeDark",
  system: "settings.themeSystem",
};
const FOLDER_LAYOUTS: FolderRailLayout[] = ["vertical", "horizontal"];
const FOLDER_LAYOUT_LABEL_KEYS: Record<FolderRailLayout, string> = {
  vertical: "settings.folderLayoutVertical",
  horizontal: "settings.folderLayoutHorizontal",
};
const CHAT_LIST_DENSITIES: ChatListDensity[] = ["standard", "compact"];
const CHAT_LIST_DENSITY_LABEL_KEYS: Record<ChatListDensity, string> = {
  standard: "settings.chatListDensityStandard",
  compact: "settings.chatListDensityCompact",
};
const STATUS_EMOJI_PRESETS = [
  { name: "speech_balloon", code: "1f4ac", symbol: "💬" },
  { name: "house", code: "1f3e0", symbol: "🏠" },
  { name: "palm_tree", code: "1f334", symbol: "🌴" },
  { name: "plate_with_cutlery", code: "1f37d-fe0f", symbol: "🍽️" },
  { name: "helmet_with_white_cross", code: "26d1-fe0f", symbol: "⛑️" },
  { name: "spiral_calendar_pad", code: "1f5d3-fe0f", symbol: "🗓️" },
] as const;

interface RightPanelUserMenuProps {
  heading?: string;
  onOpenAboutDrawer?: () => void;
  onOpenBuildsDrawer?: () => void;
}

interface MenuButtonProps {
  label: string;
  icon: IconName;
  subtitle?: string;
  right?: React.ReactNode;
  onClick: () => void;
}

interface OptionButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function getInstanceLabel(realm: string, email: string): string {
  try {
    const host = new URL(realm.startsWith("http") ? realm : `https://${realm}`).hostname;
    return host || email;
  } catch {
    return email;
  }
}

function resolveRealmIconUrl(realmIcon?: string): string | null {
  if (realmIcon == null) return null;
  const trimmed = realmIcon.trim();
  if (trimmed.length === 0) return null;
  return isValidUrl(trimmed) ? trimmed : null;
}

const MenuButton: React.FC<MenuButtonProps> = ({ label, icon, subtitle, right, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-bg-elevated"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-bg">
          <Icon name={icon} size={18} className="text-accent" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-text-primary">{label}</span>
          {subtitle && <span className="mt-0.5 block text-[11px] text-text-muted">{subtitle}</span>}
        </span>
      </span>
      {right}
    </button>
  );
};

const OptionButton: React.FC<OptionButtonProps> = ({ label, active, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-bg"
    >
      <span className={active ? "font-medium text-text-primary" : "text-text-primary"}>
        {label}
      </span>
      {active ? <Icon name="check" size={14} className="text-accent" /> : null}
    </button>
  );
};

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
  const chatListDensity = useSettingsStore((s) => s.chatListDensity);
  const setChatListDensity = useSettingsStore((s) => s.setChatListDensity);
  const currentThemeMode = useThemeStore((s) => s.mode);
  const currentPaletteId = useThemeStore((s) => s.paletteId);
  const availablePalettes = useMemo(() => getAvailablePalettes(), []);
  const [soundSettingsOpen, setSoundSettingsOpen] = useState(false);
  const [languageSettingsOpen, setLanguageSettingsOpen] = useState(false);
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);
  const [chatSortingOpen, setChatSortingOpen] = useState(false);
  const [folderLayoutOpen, setFolderLayoutOpen] = useState(false);
  const [chatListDensityOpen, setChatListDensityOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusTextDraft, setStatusTextDraft] = useState("");
  const [statusAwayDraft, setStatusAwayDraft] = useState(false);
  const [statusEmojiNameDraft, setStatusEmojiNameDraft] = useState<string>("");
  const [statusEmojiCodeDraft, setStatusEmojiCodeDraft] = useState<string>("");
  const [statusEmojiPickerOpen, setStatusEmojiPickerOpen] = useState(false);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
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
    () => resolveRealmIconUrl(currentInstance?.realmIcon),
    [currentInstance?.realmIcon],
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
      setLanguage(nextLocale as "en" | "ru");
    },
    [locales, setLanguage, setLocale],
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
    [handleSelectLanguage, locales],
  );

  const soundLabel = useMemo(
    () => t(NOTIFICATION_SOUND_LABEL_KEYS[notificationSound]),
    [notificationSound, t],
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
    const emojiName = normalizeStatusEmojiName(data.names?.[0] ?? "");
    const emojiCode = encodeEmojiToCode(data.emoji ?? "");
    if (!emojiName || !emojiCode) {
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
              <MenuButton
                label={t("settings.personalInfo")}
                icon="accountCircle"
                onClick={openPersonalInfo}
                right={<Icon name="chevron-right" size={16} className="text-text-muted" />}
              />
              <MenuButton
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
              <MenuButton
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
                    <OptionButton
                      key={sound}
                      label={t(NOTIFICATION_SOUND_LABEL_KEYS[sound])}
                      active={notificationSound === sound}
                      onClick={() => handleSetNotificationSound(sound)}
                    />
                  ))}
                </div>
              )}
              <MenuButton
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
                    <OptionButton
                      key={localeOption.id}
                      label={localeOption.nativeLabel}
                      active={currentLocale === localeOption.id}
                      onClick={() => handleSetLanguage(localeOption.id)}
                    />
                  ))}
                </div>
              )}

              <MenuButton
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
                      <OptionButton
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

              <MenuButton
                label={t("settings.chatSorting")}
                icon="channels"
                onClick={() => setChatSortingOpen((open) => !open)}
                subtitle={t("settings.chatSortingHint")}
                right={
                  <Icon
                    name={chatSortingOpen ? "chevron-up" : "chevron-right"}
                    size={16}
                    className="text-text-muted"
                  />
                }
              />
              {chatSortingOpen && (
                <div className="mx-2 mb-2 divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle bg-bg-elevated">
                  <OptionButton
                    label={t("settings.chatSortingPrioritizeDirects")}
                    active={prioritizePersonalUnread}
                    onClick={() => setPrioritizePersonalUnread(!prioritizePersonalUnread)}
                  />
                  <OptionButton
                    label={t("settings.chatSortingPrioritizeUnmuted")}
                    active={prioritizeUnmutedUnreadChannels}
                    onClick={() =>
                      setPrioritizeUnmutedUnreadChannels(!prioritizeUnmutedUnreadChannels)
                    }
                  />
                </div>
              )}

              <MenuButton
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
                    <OptionButton
                      key={layout}
                      label={t(FOLDER_LAYOUT_LABEL_KEYS[layout])}
                      active={folderRailLayout === layout}
                      onClick={() => setFolderRailLayout(layout)}
                    />
                  ))}
                </div>
              )}

              <MenuButton
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
                    <OptionButton
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
              <MenuButton
                label={t("settings.selectBuild")}
                icon="grid"
                subtitle={t("settings.selectBuildHint")}
                onClick={openBuilds}
                right={<Icon name="chevron-right" size={16} className="text-text-muted" />}
              />
              <MenuButton
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
              <MenuButton
                label={t("settings.connectionDiagnostics")}
                icon="visibility"
                onClick={openDiagnostics}
                right={<Icon name="chevron-right" size={16} className="text-text-muted" />}
              />
              <MenuButton
                label={t("settings.clearCache")}
                icon="delete"
                subtitle={t("settings.clearCacheHint")}
                onClick={handleClearCache}
              />
            </div>
          </section>
        </div>
      </ScrollArea>

      <Dialog.Root
        open={statusDialogOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setStatusDialogOpen(true);
            return;
          }
          closeStatusDialog();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-overlay bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-modal w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-subtle bg-bg-elevated shadow-xl">
            <div className="border-b border-border-subtle px-5 py-4">
              <Dialog.Title className="text-base font-semibold text-text-primary">
                {t("settings.status")}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-text-muted">
                {t("settings.statusDialogHint")}
              </Dialog.Description>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                {STATUS_EMOJI_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setStatusEmojiNameDraft(preset.name);
                      setStatusEmojiCodeDraft(preset.code);
                      setStatusEmojiPickerOpen(false);
                    }}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-md border text-base transition-colors ${
                      statusEmojiNameDraft === preset.name
                        ? "bg-accent/15 border-accent"
                        : "border-border-subtle bg-bg hover:bg-bg-elevated"
                    }`}
                    aria-label={`${t("settings.status")} ${preset.symbol}`}
                  >
                    {preset.symbol}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setStatusEmojiPickerOpen((open) => !open)}
                  className={`inline-flex h-9 items-center rounded-md border px-2.5 text-xs font-medium transition-colors ${
                    statusEmojiPickerOpen
                      ? "bg-accent/15 border-accent text-text-primary"
                      : "border-border-subtle bg-bg text-text-primary hover:bg-bg-elevated"
                  }`}
                  aria-label={t("settings.statusChooseEmoji")}
                >
                  {t("settings.statusChooseEmoji")}
                </button>
              </div>

              {statusEmojiPickerOpen && (
                <div className="overflow-hidden rounded-lg border border-border-subtle">
                  <EmojiPicker
                    onEmojiClick={handleStatusEmojiPick}
                    searchDisabled={false}
                    skinTonesDisabled
                    width="100%"
                    height={320}
                    lazyLoadEmojis
                    theme={statusEmojiPickerTheme}
                  />
                </div>
              )}

              <label className="block text-sm">
                <span className="mb-1.5 block text-text-muted">{t("settings.status")}</span>
                <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg px-3 py-2">
                  <span className="text-base">{selectedStatusEmoji ?? "🙂"}</span>
                  <input
                    type="text"
                    value={statusTextDraft}
                    onChange={(event) => setStatusTextDraft(event.target.value.slice(0, 60))}
                    placeholder={t("settings.statusPlaceholder")}
                    aria-label={t("settings.status")}
                    className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                  />
                </div>
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={statusAwayDraft}
                  onChange={(event) => setStatusAwayDraft(event.target.checked)}
                  className="h-4 w-4 rounded border-border-subtle bg-bg accent-accent"
                />
                <span>{t("settings.statusAwayToggle")}</span>
              </label>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border-subtle px-5 py-3">
              <button
                type="button"
                onClick={clearStatusDraft}
                className="rounded-md px-3 py-2 text-sm text-text-muted transition-colors hover:bg-bg"
                disabled={statusSubmitting}
              >
                {t("settings.statusClear")}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeStatusDialog}
                  className="rounded-md px-3 py-2 text-sm text-text-muted transition-colors hover:bg-bg"
                  disabled={statusSubmitting}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleSaveStatus();
                  }}
                  className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-text-primary transition-opacity hover:opacity-90 disabled:opacity-60"
                  disabled={statusSubmitting}
                >
                  {t("common.save")}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
