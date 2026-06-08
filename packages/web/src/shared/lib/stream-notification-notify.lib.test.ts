import { describe, expect, it } from "vitest";
import { buildStreamMessageNotificationFlags } from "./stream-notification-notify.lib";
import { DEFAULT_ZULIP_NOTIFICATION_SETTINGS } from "./zulip-notification-settings.lib";

describe("buildStreamMessageNotificationFlags", () => {
  it("disables all-message stream notifications when the stream is muted", () => {
    const result = buildStreamMessageNotificationFlags(10, DEFAULT_ZULIP_NOTIFICATION_SETTINGS, {
      isStreamMuted: () => true,
      getStreamDesktopNotificationsOverride: () => true,
      getStreamAudibleNotificationsOverride: () => true,
    });

    expect(result).toEqual({
      streamAllMessagesNotifyEnabled: false,
      streamAllMessagesAudibleEnabled: false,
    });
  });

  it("uses stream notification overrides when the stream is not muted", () => {
    const result = buildStreamMessageNotificationFlags(10, DEFAULT_ZULIP_NOTIFICATION_SETTINGS, {
      isStreamMuted: () => false,
      getStreamDesktopNotificationsOverride: () => true,
      getStreamAudibleNotificationsOverride: () => true,
    });

    expect(result).toEqual({
      streamAllMessagesNotifyEnabled: true,
      streamAllMessagesAudibleEnabled: true,
    });
  });
});
