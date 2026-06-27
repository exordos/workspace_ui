import { describe, expect, it } from "vitest";
import { DEFAULT_MESSENGER_NOTIFICATION_SETTINGS } from "./messenger-notification-settings.lib";
import { buildStreamMessageNotificationFlags } from "./stream-notification-notify.lib";

const STREAM_UUID = "00000000-0000-4000-8000-000000000010";

describe("buildStreamMessageNotificationFlags", () => {
  it("disables all-message stream notifications for muted mode", () => {
    const result = buildStreamMessageNotificationFlags(
      STREAM_UUID,
      DEFAULT_MESSENGER_NOTIFICATION_SETTINGS,
      {
        getStreamNotificationMode: () => "muted",
      },
    );

    expect(result).toEqual({
      streamAllMessagesNotifyEnabled: false,
      streamAllMessagesAudibleEnabled: false,
    });
  });

  it("enables all-message stream notifications for all_messages mode", () => {
    const result = buildStreamMessageNotificationFlags(
      STREAM_UUID,
      DEFAULT_MESSENGER_NOTIFICATION_SETTINGS,
      {
        getStreamNotificationMode: () => "all_messages",
      },
    );

    expect(result).toEqual({
      streamAllMessagesNotifyEnabled: true,
      streamAllMessagesAudibleEnabled: true,
    });
  });
});
