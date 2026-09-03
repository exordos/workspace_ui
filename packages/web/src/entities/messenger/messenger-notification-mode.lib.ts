import type {
  WorkspaceMessengerStreamNotificationMode,
  WorkspaceMessengerTopicNotificationMode,
} from "~/shared/api/messenger.types";
import type { MessengerStream } from "./messenger.types";

export type WorkspaceStreamNotificationLevel = "default" | "muted" | "subscribed";
export type WorkspaceTopicVisibilityLevel = "inherit" | "muted" | "unmuted" | "followed";

interface WorkspaceStreamNotificationTransition {
  confirmedMode: WorkspaceMessengerStreamNotificationMode;
}

const streamNotificationTransitions = new WeakMap<
  MessengerStream,
  WorkspaceStreamNotificationTransition
>();

interface WorkspaceStreamUnreadReclassification {
  previousMode: WorkspaceMessengerStreamNotificationMode;
  confirmedMode: WorkspaceMessengerStreamNotificationMode;
  remainingUnreadCount: number;
}

const pendingStreamUnreadReclassifications = new Map<
  string,
  WorkspaceStreamUnreadReclassification
>();

function streamUnreadReclassificationKey(ownerKey: string, streamUuid: string): string {
  return `${ownerKey}\0${streamUuid}`;
}

export function registerWorkspaceStreamUnreadReclassification(
  ownerKey: string,
  streamUuid: string,
  previousMode: WorkspaceMessengerStreamNotificationMode,
  confirmedMode: WorkspaceMessengerStreamNotificationMode,
  remainingUnreadCount: number,
): void {
  const key = streamUnreadReclassificationKey(ownerKey, streamUuid);
  if (remainingUnreadCount <= 0 || previousMode === confirmedMode) {
    pendingStreamUnreadReclassifications.delete(key);
    return;
  }
  pendingStreamUnreadReclassifications.set(key, {
    previousMode,
    confirmedMode,
    remainingUnreadCount,
  });
}

export function consumeWorkspaceStreamUnreadReclassification(
  ownerKey: string,
  streamUuid: string,
  topicMode: WorkspaceMessengerTopicNotificationMode,
  unreadCount: number,
): {
  activeUnreadCount: number;
  passiveUnreadCount: number;
  activeDelta: number;
  passiveDelta: number;
} | null {
  const key = streamUnreadReclassificationKey(ownerKey, streamUuid);
  const pending = pendingStreamUnreadReclassifications.get(key);
  if (pending == null) return null;

  const accountedUnreadCount = Math.min(Math.max(0, unreadCount), pending.remainingUnreadCount);
  const wasPassive = isWorkspaceTopicEffectivelyMuted(topicMode, pending.previousMode);
  const isPassive = isWorkspaceTopicEffectivelyMuted(topicMode, pending.confirmedMode);
  pending.remainingUnreadCount -= accountedUnreadCount;
  if (pending.remainingUnreadCount === 0) pendingStreamUnreadReclassifications.delete(key);

  return {
    activeUnreadCount: isPassive ? 0 : unreadCount,
    passiveUnreadCount: isPassive ? unreadCount : 0,
    activeDelta: (isPassive ? 0 : accountedUnreadCount) - (wasPassive ? 0 : accountedUnreadCount),
    passiveDelta: (isPassive ? accountedUnreadCount : 0) - (wasPassive ? accountedUnreadCount : 0),
  };
}

export function clearWorkspaceStreamUnreadReclassification(
  ownerKey: string,
  streamUuid: string,
): void {
  pendingStreamUnreadReclassifications.delete(
    streamUnreadReclassificationKey(ownerKey, streamUuid),
  );
}

export function clearWorkspaceStreamUnreadReclassificationsForOwner(ownerKey: string): void {
  const prefix = `${ownerKey}\0`;
  for (const key of pendingStreamUnreadReclassifications.keys()) {
    if (key.startsWith(prefix)) pendingStreamUnreadReclassifications.delete(key);
  }
}

export function inheritWorkspaceStreamNotificationTransition(
  source: MessengerStream,
  target: MessengerStream,
): void {
  const transition = streamNotificationTransitions.get(source);
  if (transition != null) streamNotificationTransitions.set(target, transition);
}

export function projectWorkspaceStreamNotificationTransition(
  source: MessengerStream,
  target: MessengerStream,
): void {
  const transition = streamNotificationTransitions.get(source) ?? {
    confirmedMode: source.notificationMode,
  };
  streamNotificationTransitions.set(target, transition);
}

export function isSameWorkspaceStreamNotificationTransition(
  left: MessengerStream,
  right: MessengerStream,
): boolean {
  if (left === right) return true;
  const transition = streamNotificationTransitions.get(left);
  return transition != null && transition === streamNotificationTransitions.get(right);
}

export function resolveWorkspaceStreamCounterNotificationMode(
  stream: MessengerStream,
): WorkspaceMessengerStreamNotificationMode {
  return streamNotificationTransitions.get(stream)?.confirmedMode ?? stream.notificationMode;
}

export function updateWorkspaceStreamNotificationTransition(
  stream: MessengerStream,
  confirmedMode: WorkspaceMessengerStreamNotificationMode,
): void {
  const transition = streamNotificationTransitions.get(stream);
  if (transition != null) transition.confirmedMode = confirmedMode;
}

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

export function mapWorkspaceTopicNotificationModeToLevel(
  mode: WorkspaceMessengerTopicNotificationMode,
): WorkspaceTopicVisibilityLevel {
  switch (mode) {
    case "default":
      return "inherit";
    case "unmute":
      return "unmuted";
    case "follow":
      return "followed";
    case "mute":
      return "muted";
  }
}

export function mapTopicVisibilityLevelToWorkspaceMode(
  level: WorkspaceTopicVisibilityLevel,
): WorkspaceMessengerTopicNotificationMode {
  switch (level) {
    case "inherit":
      return "default";
    case "unmuted":
      return "unmute";
    case "followed":
      return "follow";
    case "muted":
      return "mute";
  }
}
