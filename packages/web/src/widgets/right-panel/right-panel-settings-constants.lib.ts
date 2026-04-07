import type { FolderRailLayout, NotificationSound } from "~/features/settings/settings.types";
import type { ThemeMode } from "~/shared/lib/themes/tokens";

export const NOTIFICATION_SOUNDS: NotificationSound[] = [
  "default",
  "subtle",
  "digital",
  "glass",
  "pulse",
  "none",
];

export const NOTIFICATION_SOUND_LABEL_KEYS: Record<NotificationSound, string> = {
  default: "settings.soundDefault",
  subtle: "settings.soundSubtle",
  digital: "settings.soundDigital",
  glass: "settings.soundGlass",
  pulse: "settings.soundPulse",
  none: "settings.soundNone",
};

export const THEME_MODES: ThemeMode[] = ["light", "dark", "system"];

export const THEME_MODE_LABEL_KEYS: Record<ThemeMode, string> = {
  light: "settings.themeLight",
  dark: "settings.themeDark",
  system: "settings.themeSystem",
};

export const FOLDER_LAYOUTS: FolderRailLayout[] = ["vertical", "horizontal"];

export const FOLDER_LAYOUT_LABEL_KEYS: Record<FolderRailLayout, string> = {
  vertical: "settings.folderLayoutVertical",
  horizontal: "settings.folderLayoutHorizontal",
};
