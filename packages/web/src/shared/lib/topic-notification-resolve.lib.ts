/**
 * Resolves Workspace topic `notification_mode` values.
 */

import type { WorkspaceTopicNotificationMode } from "~/shared/api/messenger.types";

export const WORKSPACE_DEFAULT_TOPIC_NOTIFICATION_MODE: WorkspaceTopicNotificationMode = "default";

export function parseWorkspaceTopicNotificationMode(
  value: unknown,
): WorkspaceTopicNotificationMode | null {
  if (value === "default" || value === "mute" || value === "follow" || value === "unmute") {
    return value;
  }
  return null;
}
