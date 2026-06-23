import { describe, expect, it } from "vitest";
import { DEFAULT_MESSENGER_NOTIFICATION_SETTINGS } from "./messenger-notification-settings.lib";
import { buildStreamMessageNotificationFlags } from "./stream-notification-notify.lib";

const STREAM_UUID = "00000000-0000-4000-8000-000000000010";

describe("buildStreamMessageNotificationFlags", () => {
  it("disables all-message stream notifications when the stream is muted", () => {
    const result = buildStreamMessageNotificationFlags(
      STREAM_UUID,
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
      STREAM_UUID,
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
