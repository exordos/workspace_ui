/**
 * Maps Zulip server notification_sound names to local audio presets.
 */

import type { NotificationSound } from "~/features/settings/settings.types";

const ZULIP_SOUND_TO_PRESET: Readonly<Record<string, NotificationSound>> = {
  ding: "default",
  ping: "subtle",
  click: "digital",
  chime: "glass",
  buzz: "pulse",
};

const LOCAL_PRESETS = new Set<NotificationSound>([
  "default",
  "subtle",
  "digital",
  "glass",
  "pulse",
  "none",
]);

/** Resolves server or local sound name to a playable preset. */
export function resolveNotificationSoundPreset(
  serverSound: string,
  localFallback: NotificationSound,
): NotificationSound {
  if (LOCAL_PRESETS.has(serverSound as NotificationSound)) {
    return serverSound as NotificationSound;
  }
  const mapped = ZULIP_SOUND_TO_PRESET[serverSound];
  if (mapped != null) {
    return mapped;
  }
  return localFallback;
}
