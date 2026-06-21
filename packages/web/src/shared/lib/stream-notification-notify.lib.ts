/**
 * Builds resolved stream notification flags for desktop/push policy.
 */

import {
  resolveStreamAllMessagesAudibleEnabled,
  resolveStreamAllMessagesNotifyEnabled,
} from "./stream-notification-resolve.lib";
import type { WorkspaceNotificationSettings } from "./messenger-notification-settings.lib";

export interface StreamNotificationOverrideReader {
  isStreamMuted?: (streamId: string) => boolean;
  getStreamDesktopNotificationsOverride: (streamId: string) => boolean | null;
  getStreamAudibleNotificationsOverride: (streamId: string) => boolean | null;
}

export function buildStreamMessageNotificationFlags(
  streamId: string,
  settings: WorkspaceNotificationSettings,
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
