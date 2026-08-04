import type {
  WorkspaceMessengerStreamNotificationMode,
  WorkspaceMessengerTopicNotificationMode,
} from "~/shared/api/messenger.types";

export type WorkspaceStreamNotificationLevel = "default" | "muted" | "subscribed";

export function isWorkspaceTopicEffectivelyMuted(
  topicMode: WorkspaceMessengerTopicNotificationMode,
  streamMode: WorkspaceMessengerStreamNotificationMode | null,
): boolean {
  return topicMode === "mute" || (topicMode === "default" && streamMode === "muted");
}

export function isWorkspaceTopicExplicitlyActive(
  topicMode: WorkspaceMessengerTopicNotificationMode,
): boolean {
  return topicMode === "unmute" || topicMode === "follow";
}

export function isWorkspaceStreamFullyMuted(
  streamMode: WorkspaceMessengerStreamNotificationMode | null,
  topicModes: readonly WorkspaceMessengerTopicNotificationMode[],
): boolean {
  return (
    streamMode === "muted" && !topicModes.some((mode) => isWorkspaceTopicExplicitlyActive(mode))
  );
}

export interface WorkspaceUnreadCounterProjection {
  unreadCount: number;
  activeUnreadCount?: number;
  passiveUnreadCount?: number;
}

export function resolveWorkspaceActiveUnreadCount(
  counters: WorkspaceUnreadCounterProjection,
): number {
  return counters.activeUnreadCount ?? counters.unreadCount;
}

export function resolveWorkspacePassiveUnreadCount(
  counters: WorkspaceUnreadCounterProjection,
): number {
  return counters.passiveUnreadCount ?? 0;
}

export function resolveWorkspaceDisplayedUnread(
  counters: WorkspaceUnreadCounterProjection,
): { count: number; passive: boolean } | null {
  const activeUnreadCount = resolveWorkspaceActiveUnreadCount(counters);
  if (activeUnreadCount > 0) return { count: activeUnreadCount, passive: false };

  const passiveUnreadCount = resolveWorkspacePassiveUnreadCount(counters);
  return passiveUnreadCount > 0 ? { count: passiveUnreadCount, passive: true } : null;
}

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
