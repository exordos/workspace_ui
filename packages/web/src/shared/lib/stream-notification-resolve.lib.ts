/**
 * Resolves Workspace stream `notification_mode` against global user settings.
 */

import type { WorkspaceStreamNotificationMode } from "~/shared/api/messenger.types";

export const WORKSPACE_DEFAULT_STREAM_NOTIFICATION_MODE: WorkspaceStreamNotificationMode =
  "all_messages";

export function parseWorkspaceStreamNotificationMode(
  value: unknown,
): WorkspaceStreamNotificationMode | null {
  if (value === "all_messages" || value === "mentions_only" || value === "muted") {
    return value;
  }
  return null;
}

export function resolveStreamAllMessagesNotifyEnabled(
  notificationMode: WorkspaceStreamNotificationMode,
  globalEnableStreamDesktop: boolean,
): boolean {
  void globalEnableStreamDesktop;
  return notificationMode === "all_messages";
}

export function resolveStreamAllMessagesAudibleEnabled(
  notificationMode: WorkspaceStreamNotificationMode,
  globalEnableStreamAudible: boolean,
): boolean {
  void globalEnableStreamAudible;
  return notificationMode === "all_messages";
}
