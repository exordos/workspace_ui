import type { WorkspaceMessengerStreamNotificationMode } from "~/shared/api/messenger.types";

export type WorkspaceStreamNotificationLevel = "default" | "muted" | "subscribed";

export function mapWorkspaceStreamNotificationModeToLevel(
  mode: WorkspaceMessengerStreamNotificationMode,
): WorkspaceStreamNotificationLevel {
  switch (mode) {
    case "mentions_only":
      return "default";
    case "all_messages":
      return "subscribed";
    case "muted":
      return "muted";
  }
}

export function mapNotificationLevelToWorkspaceStreamMode(
  level: WorkspaceStreamNotificationLevel,
): WorkspaceMessengerStreamNotificationMode {
  switch (level) {
    case "default":
      return "mentions_only";
    case "subscribed":
      return "all_messages";
    case "muted":
      return "muted";
  }
}
