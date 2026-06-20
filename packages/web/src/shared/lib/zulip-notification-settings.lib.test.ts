import { describe, expect, it } from "vitest";
import {
  DEFAULT_ZULIP_NOTIFICATION_SETTINGS,
  extractUserSettingsFromRegisterData,
  parseZulipNotificationSettings,
  patchZulipNotificationSettings,
} from "./zulip-notification-settings.lib";

describe("zulip-notification-settings", () => {
  it("returns defaults when raw is null", () => {
    expect(parseZulipNotificationSettings(null)).toEqual(DEFAULT_ZULIP_NOTIFICATION_SETTINGS);
  });

  it("parses server notification fields", () => {
    const parsed = parseZulipNotificationSettings({
      enable_desktop_notifications: false,
      enable_stream_desktop_notifications: true,
      enable_sounds: false,
      notification_sound: "ping",
      wildcard_mentions_notify: false,
    });
    expect(parsed.enableDesktopNotifications).toBe(false);
    expect(parsed.enableStreamDesktopNotifications).toBe(true);
    expect(parsed.enableSounds).toBe(false);
    expect(parsed.notificationSound).toBe("ping");
    expect(parsed.wildcardMentionsNotify).toBe(false);
  });

  it("patches known setting keys", () => {
    const next = patchZulipNotificationSettings(
      DEFAULT_ZULIP_NOTIFICATION_SETTINGS,
      "enable_desktop_notifications",
      false,
    );
    expect(next.enableDesktopNotifications).toBe(false);
  });

  it("extracts flat legacy keys from register root", () => {
    const extracted = extractUserSettingsFromRegisterData({
      enable_desktop_notifications: true,
      enable_stream_desktop_notifications: true,
      queue_id: "q1",
    });
    expect(extracted?.enable_desktop_notifications).toBe(true);
    expect(extracted?.enable_stream_desktop_notifications).toBe(true);
  });

  it("ignores unknown setting keys", () => {
    const next = patchZulipNotificationSettings(
      DEFAULT_ZULIP_NOTIFICATION_SETTINGS,
      "unknown_setting",
      true,
    );
    expect(next).toEqual(DEFAULT_ZULIP_NOTIFICATION_SETTINGS);
  });
});
