import React from "react";
import type { FolderRailLayout } from "~/features/settings/settings.types";
import { selectMode, selectPalette } from "~/features/theme-picker/theme-picker.model";
import type { AvailablePalette } from "~/features/theme-picker/theme-picker.types";
import { useTranslation } from "~/i18n/i18n";
import type { ThemeMode } from "~/shared/lib/themes/tokens";
import {
  FOLDER_LAYOUT_LABEL_KEYS,
  FOLDER_LAYOUTS,
  THEME_MODE_LABEL_KEYS,
  THEME_MODES,
} from "./right-panel-settings-constants.lib";

export const RightPanelThemeSettingsPanel = React.memo(function RightPanelThemeSettingsPanel({
  currentThemeMode,
  currentPaletteId,
  availablePalettes,
}: {
  currentThemeMode: ThemeMode;
  currentPaletteId: string;
  availablePalettes: readonly AvailablePalette[];
}) {
  const { t } = useTranslation();
  return (
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
  );
});

export const RightPanelChatSortingPanel = React.memo(function RightPanelChatSortingPanel({
  prioritizePersonalUnread,
  prioritizeUnmutedUnreadChannels,
  onTogglePrioritizePersonalUnread,
  onTogglePrioritizeUnmutedUnreadChannels,
}: {
  prioritizePersonalUnread: boolean;
  prioritizeUnmutedUnreadChannels: boolean;
  onTogglePrioritizePersonalUnread: () => void;
  onTogglePrioritizeUnmutedUnreadChannels: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 rounded-xl border border-border-subtle bg-card-bg p-4">
      <button
        type="button"
        onClick={onTogglePrioritizePersonalUnread}
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
        onClick={onTogglePrioritizeUnmutedUnreadChannels}
        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
          prioritizeUnmutedUnreadChannels
            ? "bg-accent text-on-accent"
            : "bg-bg text-text-primary hover:bg-bg-elevated"
        }`}
      >
        {t("settings.chatSortingPrioritizeUnmuted")}
      </button>
    </div>
  );
});

export const RightPanelFolderLayoutPanel = React.memo(function RightPanelFolderLayoutPanel({
  folderRailLayout,
  setFolderRailLayout,
}: {
  folderRailLayout: FolderRailLayout;
  setFolderRailLayout: (layout: FolderRailLayout) => void;
}) {
  const { t } = useTranslation();
  return (
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
  );
});
