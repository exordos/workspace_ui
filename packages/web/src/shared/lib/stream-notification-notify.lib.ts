/**
 * Builds resolved stream notification flags for desktop/push policy.
 */

import {
  resolveStreamAllMessagesAudibleEnabled,
  resolveStreamAllMessagesNotifyEnabled,
} from "./stream-notification-resolve.lib";
import type { ZulipNotificationSettings } from "./zulip-notification-settings.lib";

export interface StreamNotificationOverrideReader {
  isStreamMuted?: (streamId: number) => boolean;
  getStreamDesktopNotificationsOverride: (streamId: number) => boolean | null;
  getStreamAudibleNotificationsOverride: (streamId: number) => boolean | null;
}

export function buildStreamMessageNotificationFlags(
  streamId: number,
  settings: ZulipNotificationSettings,
  overrides: StreamNotificationOverrideReader,
): {
  streamAllMessagesNotifyEnabled: boolean;
  streamAllMessagesAudibleEnabled: boolean;
} {
  const streamMuted = overrides.isStreamMuted?.(streamId) ?? false;
  return {
    streamAllMessagesNotifyEnabled: streamMuted
      ? false
      : resolveStreamAllMessagesNotifyEnabled(
          overrides.getStreamDesktopNotificationsOverride(streamId),
          settings.enableStreamDesktopNotifications,
        ),
    streamAllMessagesAudibleEnabled: streamMuted
      ? false
      : resolveStreamAllMessagesAudibleEnabled(
          overrides.getStreamAudibleNotificationsOverride(streamId),
          settings.enableStreamAudibleNotifications,
        ),
  };
}
