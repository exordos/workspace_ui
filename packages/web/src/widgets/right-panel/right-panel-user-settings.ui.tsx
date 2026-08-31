import React, { useCallback, useMemo, useState } from "react";
import { useThemeStore } from "~/entities/theme/theme.model";
import { AUTH_IDLE_TIMEOUT_PRESETS } from "~/features/settings/auth-idle-timeout.lib";
import { useSettingsStore } from "~/features/settings/settings.model";
import type {
  AuthIdleTimeout,
  ChatListDensity,
  FolderRailLayout,
  NotificationSound,
} from "~/features/settings/settings.types";
import {
  getAvailablePalettes,
  selectMode,
  selectPalette,
} from "~/features/theme-picker/theme-picker.model";
import type { AvailablePalette } from "~/features/theme-picker/theme-picker.types";
import { useTranslation } from "~/i18n/i18n";
import { playNotificationSound } from "~/shared/lib/notification-sound";
import type { ThemeMode } from "~/shared/lib/themes/tokens";
import type { IconName } from "~/shared/ui/icon";
import { Icon } from "~/shared/ui/icon";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { RightPanelOptionButton, RightPanelOptionList } from "./right-panel-option-list.ui";
import { RightPanelUserMenuMenuButton } from "./right-panel-user-menu-buttons.ui";
import {
  AUTH_IDLE_TIMEOUT_LABEL_KEYS,
  CHAT_LIST_DENSITIES,
  CHAT_LIST_DENSITY_LABEL_KEYS,
  FOLDER_LAYOUT_LABEL_KEYS,
  FOLDER_LAYOUTS,
  MODE_LABEL_KEYS,
  NOTIFICATION_SOUND_LABEL_KEYS,
  NOTIFICATION_SOUNDS,
  THEME_MODES,
} from "./right-panel-user-menu-constants.lib";

interface NestedHeaderProps {
  title: string;
  onBack: () => void;
  onClose: () => void;
}

function NestedHeader({ title, onBack, onClose }: Readonly<NestedHeaderProps>): React.ReactElement {
  const { t } = useTranslation();
  return (
    <header className="box-content flex h-10 shrink-0 items-center justify-between px-5 pt-5">
      <button
        type="button"
        onClick={onBack}
        aria-label={t("common.back")}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-text-secondary transition-colors hover:bg-sidebar-hover hover:text-text-primary"
      >
        <Icon name="chevron-right" size={20} className="-rotate-180 text-text-secondary" />
      </button>
      <h2 className="min-w-0 flex-1 truncate px-2 text-left text-base font-medium text-text-primary">
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-text-secondary transition-colors hover:bg-sidebar-hover hover:text-text-primary"
      >
        <Icon name="close" size={16} />
      </button>
    </header>
  );
}

function OptionSurface({
  children,
  panelId,
  triggerId,
  testId,
}: Readonly<{
  children: React.ReactNode;
  panelId: string;
  triggerId: string;
  testId: string;
}>): React.ReactElement {
  return (
    <RightPanelOptionList
      id={panelId}
      aria-labelledby={triggerId}
      role="region"
      testId={testId}
      variant="spaced"
      className="bg-bg-elevated/60 w-full"
    >
      {children}
    </RightPanelOptionList>
  );
}

function SettingsOptionRow({
  label,
  active,
  onClick,
}: Readonly<{
  label: string;
  active: boolean;
  onClick: () => void;
}>): React.ReactElement {
  return (
    <li>
      <RightPanelOptionButton label={label} active={active} onClick={onClick} />
    </li>
  );
}

type SettingsSection = "sound" | "language" | "timeout";

const DEFAULT_SETTINGS_SECTIONS: Record<SettingsSection, boolean> = {
  sound: false,
  language: false,
  timeout: false,
};

export function RightPanelUserSettings({
  onBack,
  onClose,
  showHeader = true,
}: Readonly<{
  onBack: () => void;
  onClose: () => void;
  showHeader?: boolean;
}>): React.ReactElement {
  const { t, locale: currentLocale, supportedLocales: locales } = useTranslation();
  const notificationSound = useSettingsStore((s) => s.notificationSound);
  const setNotificationSound = useSettingsStore((s) => s.setNotificationSound);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const authIdleTimeout = useSettingsStore((s) => s.authIdleTimeout);
  const setAuthIdleTimeout = useSettingsStore((s) => s.setAuthIdleTimeout);
  const [expandedSections, setExpandedSections] =
    useState<Record<SettingsSection, boolean>>(DEFAULT_SETTINGS_SECTIONS);

  const soundLabel = t(NOTIFICATION_SOUND_LABEL_KEYS[notificationSound]);
  const localeLabel =
    locales.find((supportedLocale) => supportedLocale.id === currentLocale)?.nativeLabel ??
    currentLocale;
  const timeoutLabel = t(AUTH_IDLE_TIMEOUT_LABEL_KEYS[authIdleTimeout]);

  const toggleSection = useCallback((section: SettingsSection) => {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  }, []);

  const selectSound = useCallback(
    (sound: NotificationSound) => {
      setNotificationSound(sound);
      if (sound !== "none") {
        playNotificationSound(sound);
      }
    },
    [setNotificationSound],
  );
  const selectLanguage = useCallback(
    (language: (typeof locales)[number]["id"]) => {
      setLanguage(language);
    },
    [setLanguage],
  );
  const selectTimeout = useCallback(
    (timeout: AuthIdleTimeout) => {
      setAuthIdleTimeout(timeout);
    },
    [setAuthIdleTimeout],
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary"
      data-testid="right-panel-settings"
    >
      {showHeader ? (
        <NestedHeader title={t("settings.settings")} onBack={onBack} onClose={onClose} />
      ) : null}
      <ScrollArea className="min-h-0 flex-1 pb-5 pt-3">
        <div className="space-y-0 px-2">
          <RightPanelUserMenuMenuButton
            label={t("settings.notificationSound")}
            icon="volumeUp"
            variant="nested"
            onClick={() => toggleSection("sound")}
            id="right-panel-settings-sound-trigger"
            testId="right-panel-settings-sound-trigger"
            aria-expanded={expandedSections.sound}
            aria-controls="right-panel-settings-sound-options"
            right={
              <span className="flex items-center gap-2 text-sm text-text-secondary">
                {soundLabel}
                <Icon name={expandedSections.sound ? "chevron-up" : "chevron-right"} size={16} />
              </span>
            }
          />
          {expandedSections.sound ? (
            <OptionSurface
              panelId="right-panel-settings-sound-options"
              testId="right-panel-settings-sound-options"
              triggerId="right-panel-settings-sound-trigger"
            >
              {NOTIFICATION_SOUNDS.map((sound) => (
                <SettingsOptionRow
                  key={sound}
                  label={t(NOTIFICATION_SOUND_LABEL_KEYS[sound])}
                  active={notificationSound === sound}
                  onClick={() => selectSound(sound)}
                />
              ))}
            </OptionSurface>
          ) : null}

          <RightPanelUserMenuMenuButton
            label={t("settings.language")}
            icon="language"
            variant="nested"
            onClick={() => toggleSection("language")}
            id="right-panel-settings-language-trigger"
            testId="right-panel-settings-language-trigger"
            aria-expanded={expandedSections.language}
            aria-controls="right-panel-settings-language-options"
            right={
              <span className="flex items-center gap-2 text-sm text-text-secondary">
                {localeLabel}
                <Icon name={expandedSections.language ? "chevron-up" : "chevron-right"} size={16} />
              </span>
            }
          />
          {expandedSections.language ? (
            <OptionSurface
              panelId="right-panel-settings-language-options"
              testId="right-panel-settings-language-options"
              triggerId="right-panel-settings-language-trigger"
            >
              {locales.map((localeOption) => (
                <SettingsOptionRow
                  key={localeOption.id}
                  label={localeOption.nativeLabel}
                  active={currentLocale === localeOption.id}
                  onClick={() => selectLanguage(localeOption.id)}
                />
              ))}
            </OptionSurface>
          ) : null}

          <RightPanelUserMenuMenuButton
            label={t("settings.authIdleTimeout")}
            icon="delete_history"
            subtitle={t("settings.authIdleTimeoutHint")}
            variant="nested"
            onClick={() => toggleSection("timeout")}
            id="right-panel-settings-timeout-trigger"
            testId="right-panel-settings-timeout-trigger"
            aria-expanded={expandedSections.timeout}
            aria-controls="right-panel-settings-timeout-options"
            right={
              <span className="flex items-center gap-2 text-sm text-text-secondary">
                {timeoutLabel}
                <Icon name={expandedSections.timeout ? "chevron-up" : "chevron-right"} size={16} />
              </span>
            }
          />
          {expandedSections.timeout ? (
            <OptionSurface
              panelId="right-panel-settings-timeout-options"
              testId="right-panel-settings-timeout-options"
              triggerId="right-panel-settings-timeout-trigger"
            >
              {AUTH_IDLE_TIMEOUT_PRESETS.map((timeout) => (
                <SettingsOptionRow
                  key={timeout}
                  label={t(AUTH_IDLE_TIMEOUT_LABEL_KEYS[timeout])}
                  active={authIdleTimeout === timeout}
                  onClick={() => selectTimeout(timeout)}
                />
              ))}
            </OptionSurface>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

type AppearanceSection = "theme" | "sorting" | "folders" | "density";

const APPEARANCE_SECTION_LIST_CLASS =
  "space-y-0 px-2 [&>div+div]:relative [&>div+div]:before:pointer-events-none [&>div+div]:before:absolute [&>div+div]:before:inset-x-0 [&>div+div]:before:top-0 [&>div+div]:before:h-px [&>div+div]:before:bg-border-subtle";

const DEFAULT_APPEARANCE_SECTIONS: Record<AppearanceSection, boolean> = {
  theme: false,
  sorting: false,
  folders: false,
  density: false,
};

const THEME_MODE_ICONS: Record<ThemeMode, IconName> = {
  light: "wb_sunny",
  dark: "bedtime",
  system: "desktop_windows",
};

const THEME_MODE_ICON_SIZES: Record<ThemeMode, number> = {
  light: 18,
  dark: 16,
  system: 17,
};

function ThemeOptions({
  currentThemeMode,
  currentPaletteId,
  availablePalettes,
}: Readonly<{
  currentThemeMode: ThemeMode;
  currentPaletteId: string;
  availablePalettes: readonly AvailablePalette[];
}>): React.ReactElement {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 rounded-[8px] bg-bg p-1">
        {THEME_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            aria-label={t(MODE_LABEL_KEYS[mode])}
            title={t(MODE_LABEL_KEYS[mode])}
            aria-pressed={currentThemeMode === mode}
            data-testid={`settings-theme-mode-${mode}`}
            onClick={() => selectMode(mode)}
            className={`flex h-6 items-center justify-center rounded-[8px] transition-colors ${
              currentThemeMode === mode
                ? "bg-card-bg text-accent"
                : "text-text-muted hover:bg-card-bg-active hover:text-text-primary"
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center">
              <Icon name={THEME_MODE_ICONS[mode]} size={THEME_MODE_ICON_SIZES[mode]} />
            </span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {availablePalettes.map((palette) => (
          <button
            key={palette.id}
            type="button"
            data-testid={`settings-theme-palette-${palette.id}`}
            aria-pressed={currentPaletteId === palette.id}
            onClick={() => selectPalette(palette.id)}
            className={`flex h-8 min-w-0 items-center justify-between gap-2 rounded-lg border px-2 py-0 text-sm leading-4 transition-colors ${
              currentPaletteId === palette.id
                ? "border-accent bg-bg"
                : "border-transparent bg-bg hover:bg-card-bg-active"
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: palette.preview.accent }}
              />
              <span className="truncate text-text-primary">{palette.name}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function RightPanelUserAppearance({
  onBack,
  onClose,
  showHeader = true,
}: Readonly<{
  onBack: () => void;
  onClose: () => void;
  showHeader?: boolean;
}>): React.ReactElement {
  const { t } = useTranslation();
  const currentThemeMode = useThemeStore((s) => s.mode);
  const currentPaletteId = useThemeStore((s) => s.paletteId);
  const availablePalettes = useMemo(() => getAvailablePalettes(), []);
  const messengerSidebarSortMode = useSettingsStore((s) => s.messengerSidebarSortMode);
  const setMessengerSidebarSortMode = useSettingsStore((s) => s.setMessengerSidebarSortMode);
  const folderRailLayout = useSettingsStore((s) => s.folderRailLayout);
  const setFolderRailLayout = useSettingsStore((s) => s.setFolderRailLayout);
  const chatListDensity = useSettingsStore((s) => s.chatListDensity);
  const setChatListDensity = useSettingsStore((s) => s.setChatListDensity);
  const [expandedSections, setExpandedSections] = useState<Record<AppearanceSection, boolean>>(
    DEFAULT_APPEARANCE_SECTIONS,
  );

  const toggleSection = useCallback((section: AppearanceSection) => {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  }, []);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary"
      data-testid="right-panel-appearance"
    >
      {showHeader ? (
        <NestedHeader title={t("settings.appearance")} onBack={onBack} onClose={onClose} />
      ) : null}
      <ScrollArea className="min-h-0 flex-1 pb-5 pt-3">
        <div
          className={APPEARANCE_SECTION_LIST_CLASS}
          data-testid="right-panel-appearance-sections"
        >
          <div>
            <RightPanelUserMenuMenuButton
              ariaLabel={t("settings.themeSettings")}
              label={t("settings.themeSettings")}
              icon="draw"
              variant="nested"
              onClick={() => toggleSection("theme")}
              id="right-panel-appearance-theme-trigger"
              testId="right-panel-appearance-theme-trigger"
              aria-expanded={expandedSections.theme}
              aria-controls="right-panel-appearance-theme-options"
              right={
                <Icon name={expandedSections.theme ? "chevron-up" : "chevron-right"} size={16} />
              }
            />
            {expandedSections.theme ? (
              <OptionSurface
                panelId="right-panel-appearance-theme-options"
                testId="right-panel-appearance-theme-options"
                triggerId="right-panel-appearance-theme-trigger"
              >
                <li>
                  <ThemeOptions
                    currentThemeMode={currentThemeMode}
                    currentPaletteId={currentPaletteId}
                    availablePalettes={availablePalettes}
                  />
                </li>
              </OptionSurface>
            ) : null}
          </div>

          <div>
            <RightPanelUserMenuMenuButton
              ariaLabel={t("settings.messengerSidebarSortMode")}
              label={t("settings.messengerSidebarSortMode")}
              icon="list_arrow"
              variant="nested"
              onClick={() => toggleSection("sorting")}
              id="right-panel-appearance-sorting-trigger"
              testId="right-panel-appearance-sorting-trigger"
              aria-expanded={expandedSections.sorting}
              aria-controls="right-panel-appearance-sorting-options"
              right={
                <Icon name={expandedSections.sorting ? "chevron-up" : "chevron-right"} size={16} />
              }
            />
            {expandedSections.sorting ? (
              <OptionSurface
                panelId="right-panel-appearance-sorting-options"
                testId="right-panel-appearance-sorting-options"
                triggerId="right-panel-appearance-sorting-trigger"
              >
                <SettingsOptionRow
                  label={t("settings.messengerSidebarSortModeLastMessage")}
                  active={messengerSidebarSortMode === "last_message"}
                  onClick={() => setMessengerSidebarSortMode("last_message")}
                />
                <SettingsOptionRow
                  label={t("settings.messengerSidebarSortModeUnreadFirst")}
                  active={messengerSidebarSortMode === "unread_first"}
                  onClick={() => setMessengerSidebarSortMode("unread_first")}
                />
              </OptionSurface>
            ) : null}
          </div>

          <div>
            <RightPanelUserMenuMenuButton
              ariaLabel={t("settings.folderLayout")}
              label={t("settings.folderLayout")}
              icon="folder_copy"
              variant="nested"
              onClick={() => toggleSection("folders")}
              id="right-panel-appearance-folder-trigger"
              testId="right-panel-appearance-folder-trigger"
              aria-expanded={expandedSections.folders}
              aria-controls="right-panel-appearance-folder-options"
              right={
                <Icon name={expandedSections.folders ? "chevron-up" : "chevron-right"} size={16} />
              }
            />
            {expandedSections.folders ? (
              <OptionSurface
                panelId="right-panel-appearance-folder-options"
                testId="right-panel-appearance-folder-options"
                triggerId="right-panel-appearance-folder-trigger"
              >
                {FOLDER_LAYOUTS.map((layout: FolderRailLayout) => (
                  <SettingsOptionRow
                    key={layout}
                    label={t(FOLDER_LAYOUT_LABEL_KEYS[layout])}
                    active={folderRailLayout === layout}
                    onClick={() => setFolderRailLayout(layout)}
                  />
                ))}
              </OptionSurface>
            ) : null}
          </div>

          <div>
            <RightPanelUserMenuMenuButton
              ariaLabel={t("settings.chatListDensity")}
              label={t("settings.chatListDensity")}
              icon="lists"
              variant="nested"
              onClick={() => toggleSection("density")}
              id="right-panel-appearance-density-trigger"
              testId="right-panel-appearance-density-trigger"
              aria-expanded={expandedSections.density}
              aria-controls="right-panel-appearance-density-options"
              right={
                <Icon name={expandedSections.density ? "chevron-up" : "chevron-right"} size={16} />
              }
            />
            {expandedSections.density ? (
              <OptionSurface
                panelId="right-panel-appearance-density-options"
                testId="right-panel-appearance-density-options"
                triggerId="right-panel-appearance-density-trigger"
              >
                {CHAT_LIST_DENSITIES.map((density: ChatListDensity) => (
                  <SettingsOptionRow
                    key={density}
                    label={t(CHAT_LIST_DENSITY_LABEL_KEYS[density])}
                    active={chatListDensity === density}
                    onClick={() => setChatListDensity(density)}
                  />
                ))}
              </OptionSurface>
            ) : null}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
