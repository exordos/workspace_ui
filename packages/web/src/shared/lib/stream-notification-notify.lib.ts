/**
 * Builds resolved stream notification flags for desktop/push policy.
 */

import type { WorkspaceStreamNotificationMode } from "~/shared/api/messenger.types";
import {
  WORKSPACE_DEFAULT_STREAM_NOTIFICATION_MODE,
  resolveStreamAllMessagesAudibleEnabled,
  resolveStreamAllMessagesNotifyEnabled,
} from "./stream-notification-resolve.lib";
import type { WorkspaceNotificationSettings } from "./messenger-notification-settings.lib";

export interface StreamNotificationOverrideReader {
  getStreamNotificationMode: (streamId: string) => WorkspaceStreamNotificationMode;
}

export function buildStreamMessageNotificationFlags(
  streamId: string,
  settings: WorkspaceNotificationSettings,
  overrides: StreamNotificationOverrideReader,
): {
  streamAllMessagesNotifyEnabled: boolean;
  streamAllMessagesAudibleEnabled: boolean;
} {
  const notificationMode =
    overrides.getStreamNotificationMode(streamId) ?? WORKSPACE_DEFAULT_STREAM_NOTIFICATION_MODE;
  return {
    streamAllMessagesNotifyEnabled: resolveStreamAllMessagesNotifyEnabled(
      notificationMode,
      settings.enableStreamDesktopNotifications,
    ),
    streamAllMessagesAudibleEnabled: resolveStreamAllMessagesAudibleEnabled(
      notificationMode,
      settings.enableStreamAudibleNotifications,
    ),
  };
}
