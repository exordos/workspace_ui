import type {
  ChatListDensity,
  FolderRailLayout,
  NotificationSound,
} from "~/features/settings/settings.types";
import type { ThemeMode } from "~/shared/lib/themes/tokens";

export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "dev";

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

export const MODE_LABEL_KEYS: Record<ThemeMode, string> = {
  light: "settings.themeLight",
  dark: "settings.themeDark",
  system: "settings.themeSystem",
};

export const FOLDER_LAYOUTS: FolderRailLayout[] = ["vertical", "horizontal"];

export const FOLDER_LAYOUT_LABEL_KEYS: Record<FolderRailLayout, string> = {
  vertical: "settings.folderLayoutVertical",
  horizontal: "settings.folderLayoutHorizontal",
};

export const CHAT_LIST_DENSITIES: ChatListDensity[] = ["standard", "compact"];

export const CHAT_LIST_DENSITY_LABEL_KEYS: Record<ChatListDensity, string> = {
  standard: "settings.chatListDensityStandard",
  compact: "settings.chatListDensityCompact",
};

export const STATUS_EMOJI_PRESETS = [
  { name: "speech_balloon", code: "1f4ac", symbol: "💬" },
  { name: "house", code: "1f3e0", symbol: "🏠" },
  { name: "palm_tree", code: "1f334", symbol: "🌴" },
  { name: "plate_with_cutlery", code: "1f37d-fe0f", symbol: "🍽️" },
  { name: "helmet_with_white_cross", code: "26d1-fe0f", symbol: "⛑️" },
  { name: "spiral_calendar_pad", code: "1f5d3-fe0f", symbol: "🗓️" },
] as const;

export function getInstanceLabel(realm: string, email: string): string {
  try {
    const host = new URL(realm.startsWith("http") ? realm : `https://${realm}`).hostname;
    return host || email;
  } catch {
    return email;
  }
}
