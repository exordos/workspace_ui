/**
 * Zulip server notification settings — parse and defaults.
 *
 * Values come from `/register` (`user_settings`) and `user_settings` realtime events.
 * Used by desktop notification policy to mirror Zulip web client behavior.
 */

export interface ZulipNotificationSettings {
  enableDesktopNotifications: boolean;
  enableStreamDesktopNotifications: boolean;
  enableFollowedTopicDesktopNotifications: boolean;
  enableSounds: boolean;
  enableStreamAudibleNotifications: boolean;
  enableFollowedTopicAudibleNotifications: boolean;
  wildcardMentionsNotify: boolean;
  notificationSound: string;
}

export const DEFAULT_ZULIP_NOTIFICATION_SETTINGS: ZulipNotificationSettings = {
  enableDesktopNotifications: true,
  enableStreamDesktopNotifications: false,
  enableFollowedTopicDesktopNotifications: true,
  enableSounds: true,
  enableStreamAudibleNotifications: false,
  enableFollowedTopicAudibleNotifications: true,
  wildcardMentionsNotify: true,
  notificationSound: "ding",
};

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

/** Parses `user_settings` object from register or event payload. */
export function parseZulipNotificationSettings(
  raw: Record<string, unknown> | null | undefined,
): ZulipNotificationSettings {
  if (raw == null) {
    return { ...DEFAULT_ZULIP_NOTIFICATION_SETTINGS };
  }

  const defaults = DEFAULT_ZULIP_NOTIFICATION_SETTINGS;
  return {
    enableDesktopNotifications: readBoolean(
      raw.enable_desktop_notifications,
      defaults.enableDesktopNotifications,
    ),
    enableStreamDesktopNotifications: readBoolean(
      raw.enable_stream_desktop_notifications,
      defaults.enableStreamDesktopNotifications,
    ),
    enableFollowedTopicDesktopNotifications: readBoolean(
      raw.enable_followed_topic_desktop_notifications,
      defaults.enableFollowedTopicDesktopNotifications,
    ),
    enableSounds: readBoolean(raw.enable_sounds, defaults.enableSounds),
    enableStreamAudibleNotifications: readBoolean(
      raw.enable_stream_audible_notifications,
      defaults.enableStreamAudibleNotifications,
    ),
    enableFollowedTopicAudibleNotifications: readBoolean(
      raw.enable_followed_topic_audible_notifications,
      defaults.enableFollowedTopicAudibleNotifications,
    ),
    wildcardMentionsNotify: readBoolean(
      raw.wildcard_mentions_notify,
      defaults.wildcardMentionsNotify,
    ),
    notificationSound: readString(raw.notification_sound, defaults.notificationSound),
  };
}

/** Applies a single setting update from a `user_settings` event. */
export function patchZulipNotificationSettings(
  current: ZulipNotificationSettings,
  property: string,
  value: unknown,
): ZulipNotificationSettings {
  switch (property) {
    case "enable_desktop_notifications":
      return {
        ...current,
        enableDesktopNotifications: readBoolean(value, current.enableDesktopNotifications),
      };
    case "enable_stream_desktop_notifications":
      return {
        ...current,
        enableStreamDesktopNotifications: readBoolean(
          value,
          current.enableStreamDesktopNotifications,
        ),
      };
    case "enable_followed_topic_desktop_notifications":
      return {
        ...current,
        enableFollowedTopicDesktopNotifications: readBoolean(
          value,
          current.enableFollowedTopicDesktopNotifications,
        ),
      };
    case "enable_sounds":
      return { ...current, enableSounds: readBoolean(value, current.enableSounds) };
    case "enable_stream_audible_notifications":
      return {
        ...current,
        enableStreamAudibleNotifications: readBoolean(
          value,
          current.enableStreamAudibleNotifications,
        ),
      };
    case "enable_followed_topic_audible_notifications":
      return {
        ...current,
        enableFollowedTopicAudibleNotifications: readBoolean(
          value,
          current.enableFollowedTopicAudibleNotifications,
        ),
      };
    case "wildcard_mentions_notify":
      return {
        ...current,
        wildcardMentionsNotify: readBoolean(value, current.wildcardMentionsNotify),
      };
    case "notification_sound":
      return { ...current, notificationSound: readString(value, current.notificationSound) };
    default:
      return current;
  }
}

const NOTIFICATION_SETTING_KEYS = [
  "enable_desktop_notifications",
  "enable_stream_desktop_notifications",
  "enable_followed_topic_desktop_notifications",
  "enable_sounds",
  "enable_stream_audible_notifications",
  "enable_followed_topic_audible_notifications",
  "wildcard_mentions_notify",
  "notification_sound",
] as const;

export function extractUserSettingsFromRegisterData(
  data: Record<string, unknown>,
): Record<string, unknown> | null {
  const nested = data.user_settings;
  if (nested != null && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }

  // Legacy register responses (pre user_settings fetch_event_types) inline keys at top level.
  const flat: Record<string, unknown> = {};
  let found = false;
  for (const key of NOTIFICATION_SETTING_KEYS) {
    if (key in data) {
      flat[key] = data[key];
      found = true;
    }
  }
  return found ? flat : null;
}
