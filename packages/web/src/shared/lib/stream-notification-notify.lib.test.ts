import { describe, expect, it } from "vitest";
import { DEFAULT_MESSENGER_NOTIFICATION_SETTINGS } from "./messenger-notification-settings.lib";
import { buildStreamMessageNotificationFlags } from "./stream-notification-notify.lib";

describe("buildStreamMessageNotificationFlags", () => {
  it("disables all-message stream notifications when the stream is muted", () => {
    const result = buildStreamMessageNotificationFlags(
      10,
      DEFAULT_MESSENGER_NOTIFICATION_SETTINGS,
      {
        isStreamMuted: () => true,
        getStreamDesktopNotificationsOverride: () => true,
        getStreamAudibleNotificationsOverride: () => true,
      },
    );

    expect(result).toEqual({
      streamAllMessagesNotifyEnabled: false,
      streamAllMessagesAudibleEnabled: false,
    });
  });

  it("uses stream notification overrides when the stream is not muted", () => {
    const result = buildStreamMessageNotificationFlags(
      10,
      DEFAULT_MESSENGER_NOTIFICATION_SETTINGS,
      {
        isStreamMuted: () => false,
        getStreamDesktopNotificationsOverride: () => true,
        getStreamAudibleNotificationsOverride: () => true,
      },
    );

    expect(result).toEqual({
      streamAllMessagesNotifyEnabled: true,
      streamAllMessagesAudibleEnabled: true,
    });
  });
});
